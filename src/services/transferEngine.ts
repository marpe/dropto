import type { DataConnection } from 'peerjs';
import { FastStreamingChecksum } from './checksum';
import { soundService } from './sound';
import { chooseWriterFactory, createStorageWriter } from './storage';
import type { StorageWriter, WriterFactory } from './storage';
import type { ProtocolMessage, TransferFile, TransferManifest, TransferMetrics } from '../types/transfer';
import { wakeLockService } from './wakeLock';

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB
const HIGH_WATERMARK = 1024 * 1024; // 1 MB
const LOW_WATERMARK = 256 * 1024; // 256 KB
const HEADER_SIZE = 16; // 4 + 8 + 4 bytes

export type TransferResult = {
  /** Paths of files whose end-to-end checksum did not match */
  corruptedFiles: string[];
};

export type EngineEventCallback = {
  onMetrics?: (metrics: TransferMetrics) => void;
  onFileStart?: (file: TransferFile, fileIndex: number) => void;
  onFileProgress?: (fileIndex: number, percent: number, bytesTransferred: number) => void;
  onFileComplete?: (fileIndex: number, verified: boolean) => void;
  onAllCompleted?: (result: TransferResult) => void;
  onError?: (err: string) => void;
  onPaused?: (isPaused: boolean) => void;
  onCancelled?: () => void;
};

export class TransferEngine {
  private conn: DataConnection | null = null;
  private isSender: boolean = false;
  private callbacks: EngineEventCallback = {};
  // True from manifest until completion/cancel; a disconnect in this window is a failure
  private isActive: boolean = false;
  private incomingQueue: Promise<void> = Promise.resolve();
  private corruptedFiles: string[] = [];

  // Sender state
  private files: TransferFile[] = [];
  private currentFileIdx: number = 0;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private senderChecksum = new FastStreamingChecksum();

  // Receiver state
  private manifest: TransferManifest | null = null;
  private currentWriter: StorageWriter | null = null;
  private createWriter: WriterFactory = () => createStorageWriter();
  private receiverChecksum = new FastStreamingChecksum();
  private receivedBytesForFile: number = 0;

  // Metrics tracking
  private totalBytes: number = 0;
  private totalBytesTransferred: number = 0;
  private speedWindow: { time: number; bytes: number }[] = [];
  private startTime: number = 0;

  public init(conn: DataConnection, isSender: boolean, callbacks: EngineEventCallback) {
    this.conn = conn;
    this.isSender = isSender;
    this.callbacks = callbacks;
    this.isCancelled = false;
    this.isPaused = false;
    this.isActive = false;

    // Direct access to underlying RTCDataChannel for backpressure and binary config
    const rawChannel = (conn as any).dataChannel as RTCDataChannel;
    if (rawChannel) {
      rawChannel.binaryType = 'arraybuffer';
      rawChannel.bufferedAmountLowThreshold = LOW_WATERMARK;
    }

    // Process messages strictly in arrival order so disk writes never overlap
    conn.on('data', (data) => {
      this.incomingQueue = this.incomingQueue
        .then(() => this.handleIncomingData(data))
        .catch((err) => this.failTransfer(err));
    });

    conn.on('close', () => {
      // Ignore closes from a previous session's connection
      if (this.conn === conn) {
        this.handleConnectionLost();
      }
    });
  }

  // =================== SENDER LOGIC ===================

  public async startSenderTransfer(files: TransferFile[], pinRequired = false) {
    if (!this.conn) throw new Error('No active WebRTC connection');

    this.files = files;
    this.currentFileIdx = 0;
    this.totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    this.totalBytesTransferred = 0;
    this.startTime = Date.now();
    this.speedWindow = [];
    this.corruptedFiles = [];
    this.isActive = true;

    wakeLockService.acquire();
    soundService.playStart();

    // 1. Send Manifest to Receiver
    const manifest: TransferManifest = {
      sessionId: crypto.randomUUID(),
      pinRequired,
      totalBytes: this.totalBytes,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        chunkSize: DEFAULT_CHUNK_SIZE,
        totalChunks: Math.ceil(f.size / DEFAULT_CHUNK_SIZE),
        relativePath: f.relativePath,
        lastModified: f.lastModified,
      })),
    };

    this.sendControlMessage({
      type: 'MANIFEST',
      payload: manifest,
    });
  }

  public async proceedWithFileSend(fileIndex: number, resumeFromChunk = 0) {
    if (this.isCancelled || !this.conn) return;

    this.currentFileIdx = fileIndex;
    const fileItem = this.files[fileIndex];
    if (!fileItem || !fileItem.rawFile) return;

    const rawFile = fileItem.rawFile;
    const totalChunks = Math.ceil(rawFile.size / DEFAULT_CHUNK_SIZE);
    fileItem.status = 'transferring';

    this.callbacks.onFileStart?.(fileItem, fileIndex);
    this.senderChecksum.reset();

    const rawChannel = (this.conn as any).dataChannel as RTCDataChannel;

    for (let chunkIdx = resumeFromChunk; chunkIdx < totalChunks; chunkIdx++) {
      if (this.isCancelled) break;

      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 100));
        if (this.isCancelled) break;
      }

      // Backpressure Check: wait if buffer exceeds high watermark
      if (rawChannel && rawChannel.bufferedAmount > HIGH_WATERMARK) {
        await new Promise<void>((resolve) => {
          const onLow = () => {
            rawChannel.removeEventListener('bufferedamountlow', onLow);
            resolve();
          };
          rawChannel.addEventListener('bufferedamountlow', onLow);
          // Safety timeout in case event is missed
          setTimeout(() => {
            rawChannel.removeEventListener('bufferedamountlow', onLow);
            resolve();
          }, 2000);
        });
      }

      // Read slice
      const start = chunkIdx * DEFAULT_CHUNK_SIZE;
      const end = Math.min(start + DEFAULT_CHUNK_SIZE, rawFile.size);
      const slice = rawFile.slice(start, end);
      const buffer = await slice.arrayBuffer();
      const payload = new Uint8Array(buffer);

      // Update sender running hash
      this.senderChecksum.update(payload);

      // Assemble binary frame with 16-byte header
      const packet = new Uint8Array(HEADER_SIZE + payload.length);
      const view = new DataView(packet.buffer);
      view.setUint32(0, fileIndex, false);
      view.setBigUint64(4, BigInt(chunkIdx), false);
      view.setUint32(12, payload.length, false);
      packet.set(payload, HEADER_SIZE);

      // Send over RTCDataChannel
      this.conn.send(packet.buffer);

      // Update metrics
      fileItem.bytesTransferred = end;
      this.totalBytesTransferred += payload.length;
      this.recordSpeed(payload.length);

      const percent = (end / rawFile.size) * 100;
      this.callbacks.onFileProgress?.(fileIndex, percent, fileItem.bytesTransferred);
      this.emitMetrics(fileItem.name, percent);
    }

    if (!this.isCancelled) {
      const checksum = this.senderChecksum.digest();
      fileItem.status = 'completed';
      fileItem.checksum = checksum;

      this.sendControlMessage({
        type: 'FILE_COMPLETE',
        payload: {
          fileIndex,
          checksum,
        },
      });
    }
  }

  // =================== RECEIVER LOGIC ===================

  /** Picks the save destination (must run inside a user gesture) and requests the first file. */
  public async startReceiving(): Promise<boolean> {
    if (!this.manifest) {
      return false;
    }

    const createWriter = await chooseWriterFactory(this.manifest.files);
    if (!createWriter) {
      return false;
    }
    this.createWriter = createWriter;
    return this.prepareAndStartReceiverFile(0);
  }

  public async prepareAndStartReceiverFile(fileIndex: number): Promise<boolean> {
    if (!this.manifest || !this.manifest.files[fileIndex]) return false;

    const fileMeta = this.manifest.files[fileIndex];
    this.currentFileIdx = fileIndex;
    this.receivedBytesForFile = 0;
    this.receiverChecksum.reset();

    // Immediately emit initial metrics so UI switches to metrics dashboard
    this.emitMetrics(fileMeta.name, 0);

    try {
      this.currentWriter = this.createWriter(fileMeta);
      const prepared = await this.currentWriter.prepare(fileMeta.name, fileMeta.size);
      if (!prepared) {
        return false;
      }

      // Notify sender ready for file
      this.sendControlMessage({
        type: 'FILE_START',
        payload: {
          fileIndex,
          resumeFromChunk: 0,
        },
      });

      return true;
    } catch (err: any) {
      this.failTransfer(new Error(`Failed to prepare disk storage: ${err?.message ?? err}`));
      return false;
    }
  }

  private async handleBinaryChunk(buffer: ArrayBuffer) {
    if (!this.currentWriter || !this.manifest) return;

    const view = new DataView(buffer);
    const fileIndex = view.getUint32(0, false);
    // const chunkIndex = Number(view.getBigUint64(4, false));
    const payloadLength = view.getUint32(12, false);

    const payload = new Uint8Array(buffer, HEADER_SIZE, payloadLength);

    // Compute checksum and stream to disk
    this.receiverChecksum.update(payload);
    await this.currentWriter.writeChunk(payload);

    this.receivedBytesForFile += payloadLength;
    this.totalBytesTransferred += payloadLength;
    this.recordSpeed(payloadLength);

    const currentFile = this.manifest.files[fileIndex];
    const percent = (this.receivedBytesForFile / currentFile.size) * 100;

    this.callbacks.onFileProgress?.(fileIndex, percent, this.receivedBytesForFile);
    this.emitMetrics(currentFile.name, percent);
  }

  // =================== PROTOCOL CONTROL FRAMES ===================

  private async handleIncomingData(data: any) {
    // After a cancel or failure, late messages from the peer must not resume or complete the transfer
    if (this.isCancelled) {
      return;
    }

    let buffer: ArrayBuffer | null = null;

    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } else if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      buffer = await data.arrayBuffer();
    }

    if (buffer) {
      await this.handleBinaryChunk(buffer);
      return;
    }

    let msg: ProtocolMessage | null = null;
    if (typeof data === 'string') {
      try {
        msg = JSON.parse(data) as ProtocolMessage;
      } catch (err) {
        console.warn('Failed to parse protocol JSON message:', err);
      }
    } else if (typeof data === 'object' && data !== null && 'type' in data) {
      msg = data as ProtocolMessage;
    }

    if (msg) {
      await this.handleControlMessage(msg);
    }
  }

  private async handleControlMessage(msg: ProtocolMessage) {
    switch (msg.type) {
      case 'MANIFEST': {
        this.manifest = msg.payload as TransferManifest;
        this.totalBytes = this.manifest.totalBytes;
        this.totalBytesTransferred = 0;
        this.startTime = Date.now();
        this.corruptedFiles = [];
        this.isActive = true;
        wakeLockService.acquire();
        soundService.playStart();
        // Notify UI to display manifest & request user save action
        this.callbacks.onFileStart?.(
          {
            ...this.manifest.files[0],
            status: 'pending',
            bytesTransferred: 0,
          },
          0
        );
        break;
      }

      case 'FILE_START': {
        // Sender received confirmation from receiver to begin streaming file
        // Not awaited: streaming a file must not block pause/cancel messages in the queue
        const { fileIndex, resumeFromChunk } = msg.payload;
        this.proceedWithFileSend(fileIndex, resumeFromChunk || 0).catch((err) => this.failTransfer(err));
        break;
      }

      case 'FILE_COMPLETE': {
        // Receiver receives completion notice from sender
        const { fileIndex, checksum } = msg.payload;
        const localChecksum = this.receiverChecksum.digest();
        const verified = localChecksum.toLowerCase() === checksum.toLowerCase();

        if (this.currentWriter) {
          await this.currentWriter.finalize();
          this.currentWriter = null;
        }

        this.sendControlMessage({
          type: 'FILE_ACK',
          payload: {
            fileIndex,
            verified,
          },
        });
        this.recordVerification(this.manifest?.files[fileIndex], verified);
        this.callbacks.onFileComplete?.(fileIndex, verified);

        // Check if there are more files in manifest
        if (this.manifest && fileIndex + 1 < this.manifest.files.length) {
          // Prepare next file
          await this.prepareAndStartReceiverFile(fileIndex + 1);
        } else {
          this.completeTransfer();
        }
        break;
      }

      case 'FILE_ACK': {
        // Sender receives confirmation that the receiver finalized and verified a file
        const { fileIndex, verified } = msg.payload;
        this.recordVerification(this.files[fileIndex], verified);
        this.callbacks.onFileComplete?.(fileIndex, verified);

        if (fileIndex + 1 >= this.files.length) {
          this.completeTransfer();
        }
        break;
      }

      case 'TRANSFER_PAUSE': {
        this.isPaused = true;
        this.callbacks.onPaused?.(true);
        break;
      }

      case 'TRANSFER_RESUME': {
        this.isPaused = false;
        this.callbacks.onPaused?.(false);
        break;
      }

      case 'TRANSFER_CANCEL': {
        // Peer cancelled: stop locally without echoing the cancel back
        this.stop();
        this.callbacks.onCancelled?.();
        break;
      }

      case 'ERROR': {
        // Peer hit a fatal error; stop streaming to it
        this.stop();
        this.callbacks.onError?.(msg.payload?.message || 'Transfer error occurred');
        break;
      }
    }
  }

  public sendControlMessage(msg: ProtocolMessage) {
    if (this.conn && this.conn.open) {
      this.conn.send(JSON.stringify(msg));
    }
  }

  // =================== CONTROLS & METRICS ===================

  public togglePause(): boolean {
    this.isPaused = !this.isPaused;
    this.sendControlMessage({
      type: this.isPaused ? 'TRANSFER_PAUSE' : 'TRANSFER_RESUME',
    });
    this.callbacks.onPaused?.(this.isPaused);
    return this.isPaused;
  }

  public cancel() {
    this.stop();
    this.sendControlMessage({
      type: 'TRANSFER_CANCEL',
    });
  }

  private recordVerification(file: { name: string; relativePath?: string } | undefined, verified: boolean) {
    if (!verified && file) {
      this.corruptedFiles.push(file.relativePath || file.name);
    }
  }

  private completeTransfer() {
    this.isActive = false;
    wakeLockService.release();
    soundService.playComplete();
    this.callbacks.onAllCompleted?.({ corruptedFiles: [...this.corruptedFiles] });
  }

  /** Local fatal error: tell the peer, stop, and surface it to the UI. */
  private failTransfer(err: unknown) {
    console.error('Transfer failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    this.sendControlMessage({
      type: 'ERROR',
      payload: { message },
    });
    this.stop();
    this.callbacks.onError?.(message);
  }

  private handleConnectionLost() {
    if (!this.isActive) {
      return;
    }
    this.stop();
    this.callbacks.onError?.('Connection to peer lost');
  }

  private stop() {
    this.isActive = false;
    this.isCancelled = true;
    wakeLockService.release();
    if (this.currentWriter) {
      this.currentWriter.abort();
      this.currentWriter = null;
    }
  }

  private recordSpeed(bytes: number) {
    const now = Date.now();
    this.speedWindow.push({ time: now, bytes });
    // Keep last 3 seconds
    const cutoff = now - 3000;
    while (this.speedWindow.length > 0 && this.speedWindow[0].time < cutoff) {
      this.speedWindow.shift();
    }
  }

  private calculateCurrentSpeed(): number {
    if (this.speedWindow.length < 2) return 0;
    const duration = (this.speedWindow[this.speedWindow.length - 1].time - this.speedWindow[0].time) / 1000;
    if (duration <= 0) return 0;
    const windowBytes = this.speedWindow.reduce((acc, item) => acc + item.bytes, 0);
    return windowBytes / duration;
  }

  private emitMetrics(currentFileName: string, currentFilePercent: number) {
    const currentSpeed = this.calculateCurrentSpeed();
    const elapsedSec = Math.max((Date.now() - this.startTime) / 1000, 1);
    const averageSpeed = this.totalBytesTransferred / elapsedSec;
    const remainingBytes = Math.max(this.totalBytes - this.totalBytesTransferred, 0);
    const etaSeconds = currentSpeed > 0 ? Math.round(remainingBytes / currentSpeed) : 0;
    const overallPercent = this.totalBytes > 0 ? (this.totalBytesTransferred / this.totalBytes) * 100 : 0;

    const metrics: TransferMetrics = {
      currentSpeed,
      averageSpeed,
      etaSeconds,
      bytesTransferred: this.totalBytesTransferred,
      totalBytes: this.totalBytes,
      overallPercent,
      currentFileIndex: this.currentFileIdx,
      totalFiles: this.isSender ? this.files.length : (this.manifest?.files.length || 1),
      currentFileName,
      currentFilePercent,
    };

    // Update document title with progress
    if (typeof document !== 'undefined') {
      document.title = `(${Math.round(overallPercent)}%) DropWave — Transferring`;
    }

    this.callbacks.onMetrics?.(metrics);
  }
}

export const transferEngine = new TransferEngine();
