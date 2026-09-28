import type { DataConnection } from 'peerjs';
import type { ControlMessage, SenderEvents, TransferFile, TransferManifest } from '../../types/transfer';
import { FastStreamingChecksum } from '../checksum';
import { displayPath } from '../../utils/filePath';
import { TransferPeer } from './peer';
import { CHUNK_SIZE, encodeChunk } from './protocol';

const HIGH_WATERMARK_BYTES = 1024 * 1024;
const LOW_WATERMARK_BYTES = 256 * 1024;
const DRAIN_TIMEOUT_MS = 2_000;
const MAX_PIN_ATTEMPTS = 3;

function waitForBufferDrain(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(safetyTimer);
      channel.removeEventListener('bufferedamountlow', done);
      resolve();
    };
    channel.addEventListener('bufferedamountlow', done);
    // Some browsers occasionally miss the event; never stall the transfer on it
    const safetyTimer = setTimeout(done, DRAIN_TIMEOUT_MS);
  });
}

/**
 * Reads part of a file from disk. The browser refuses (NotReadableError, with a generic message) when the file
 * changed or moved after it was picked, or is an online-only copy in a synced folder, so say which file and why.
 */
async function readSlice(file: TransferFile, start: number, end: number): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.rawFile.slice(start, end).arrayBuffer());
  } catch (err) {
    console.warn('Could not read', displayPath(file), err);
    throw new Error(
      `Couldn’t read ${displayPath(file)}. It may have changed or moved since it was added, or be online-only (OneDrive, iCloud). Add it again.`
    );
  }
}

function chunkCount(file: TransferFile): number {
  return Math.ceil(file.size / CHUNK_SIZE);
}

function toManifest(files: TransferFile[]): TransferManifest {
  return {
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    files: files.map(({ id, name, size, type, relativePath, lastModified }) => ({
      id,
      name,
      size,
      type,
      relativePath,
      lastModified,
    })),
  };
}

/** Streams queued files to one receiver, gated by an optional PIN. */
export class TransferSender extends TransferPeer<SenderEvents> {
  private files: TransferFile[] = [];
  private pin = '';
  private pinAttemptsLeft = 0;
  // File requests are refused until the manifest (and so any PIN check) has been passed
  private hasSentManifest = false;
  // From the receiver requesting a download's first file until that download ends, the file list is fixed
  private hasReceiverStarted = false;
  // Indices the receiver chose to download; null means every file
  private selection: number[] | null = null;
  // Resolves once this receiver may stream: at once, unless it has to wait in line for a free slot
  private slot: Promise<void> = Promise.resolve();

  constructor(conn: DataConnection, events: SenderEvents) {
    super(conn, events);
    if (conn.dataChannel) {
      conn.dataChannel.bufferedAmountLowThreshold = LOW_WATERMARK_BYTES;
    }
  }

  /** With a PIN, the receiver must authenticate before seeing any file details. */
  public start(files: TransferFile[], pin = '') {
    this.files = files;
    this.pin = pin;
    this.pinAttemptsLeft = MAX_PIN_ATTEMPTS;
    this.hasSentManifest = false;
    this.selection = null;

    if (pin) {
      this.send({ type: 'AUTH_REQUEST', payload: { attemptsLeft: MAX_PIN_ATTEMPTS, isIncorrect: false } });
    } else {
      this.sendManifest();
    }
  }

  /** Holds the download that is starting until `slot` resolves; call it from onReceiverStarted. */
  public holdUntil(slot: Promise<void>) {
    this.slot = slot;
  }

  /** Replaces the offered files while the receiver is still choosing; returns false once downloading began. */
  public updateFiles(files: TransferFile[]): boolean {
    if (this.hasReceiverStarted) {
      return false;
    }
    this.files = files;
    if (this.hasSentManifest) {
      this.sendManifest();
    }
    return true;
  }

  protected handleMessage(message: ControlMessage) {
    switch (message.type) {
      case 'AUTH_RESPONSE':
        this.handlePinResponse(message.payload.pin);
        return;
      case 'FILE_SELECTION':
        this.applySelection(message.payload.fileIndices);
        return;
      case 'FILE_START': {
        const { fileIndex, fromChunk = 0 } = message.payload;
        if (!this.hasSentManifest) {
          throw new Error('Receiver requested files before authenticating');
        }
        if (!this.transferIndices().includes(fileIndex)) {
          throw new Error('Receiver requested a file it did not select');
        }
        // Carrying on is only for the file a dropped connection cut off, at the start of the next download
        if (fromChunk > 0 && (this.hasReceiverStarted || fromChunk > chunkCount(this.files[fileIndex]))) {
          throw new Error('Receiver asked to carry on from an unexpected point');
        }
        const startBytes = Math.min(fromChunk * CHUNK_SIZE, this.files[fileIndex].size);
        if (!this.hasReceiverStarted) {
          this.hasReceiverStarted = true;
          const selected = this.transferIndices().map((index) => this.files[index]);
          this.beginTransfer(toManifest(selected).totalBytes, selected.length, startBytes);
          this.events.onReceiverStarted?.(this.transferIndices(), fromChunk > 0 ? startBytes : undefined);
        }
        // Not awaited: streaming a file (or waiting for a slot) must not block pause/cancel messages in the queue
        this.slot.then(() => this.streamFile(fileIndex, fromChunk)).catch((err) => this.failTransfer(err));
        return;
      }
      case 'FILE_ACK':
        this.handleFileAck(message.payload.fileIndex, message.payload.isVerified);
        return;
      default:
        throw new Error(`Unexpected ${message.type} message from the receiver`);
    }
  }

  protected async handleChunk(): Promise<void> {
    throw new Error('Unexpected file data from the receiver');
  }

  private transferIndices(): number[] {
    return this.selection ?? this.files.map((_, index) => index);
  }

  private applySelection(fileIndices: number[]) {
    if (!this.hasSentManifest || this.hasReceiverStarted) {
      throw new Error('Receiver changed its file selection at an unexpected time');
    }
    if (fileIndices.some((index) => index >= this.files.length)) {
      throw new Error('Receiver selected a file that was not offered');
    }
    this.selection = fileIndices;
  }

  protected onDownloadFinished() {
    // The receiver may pick again: any files, the whole list by default, from a list that may change again
    this.hasReceiverStarted = false;
    this.selection = null;
    this.slot = Promise.resolve();
  }

  private sendManifest() {
    this.hasSentManifest = true;
    this.send({ type: 'MANIFEST', payload: toManifest(this.files) });
  }

  private handlePinResponse(pin: string) {
    if (this.hasSentManifest || !this.pin) {
      return;
    }
    if (pin === this.pin) {
      this.sendManifest();
      return;
    }
    this.pinAttemptsLeft--;
    if (this.pinAttemptsLeft <= 0) {
      this.events.onPinLockout?.();
      throw new Error('Too many incorrect PIN attempts');
    }
    this.send({ type: 'AUTH_REQUEST', payload: { attemptsLeft: this.pinAttemptsLeft, isIncorrect: true } });
  }

  private handleFileAck(fileIndex: number, isVerified: boolean) {
    const file = this.files[fileIndex];
    if (!file) {
      throw new Error(`Receiver acknowledged unknown file #${fileIndex}`);
    }
    this.recordVerification(file, isVerified);
    this.events.onFileComplete?.(fileIndex, isVerified);
    const indices = this.transferIndices();
    if (fileIndex === indices[indices.length - 1]) {
      this.completeTransfer();
    }
  }

  private async streamFile(fileIndex: number, fromChunk = 0) {
    const file = this.files[fileIndex];
    if (!file) {
      throw new Error(`Receiver requested unknown file #${fileIndex}`);
    }
    const checksum = new FastStreamingChecksum();
    const totalChunks = chunkCount(file);
    // Progress counts files within the selection, not manifest indices
    const position = this.transferIndices().indexOf(fileIndex);
    const channel = this.conn.dataChannel;

    // What the receiver already has is read again here only to check the whole file at the end
    for (let chunkIndex = 0; chunkIndex < fromChunk; chunkIndex++) {
      if (this.isStopped) {
        return;
      }
      const start = chunkIndex * CHUNK_SIZE;
      checksum.update(await readSlice(file, start, Math.min(start + CHUNK_SIZE, file.size)));
    }

    if (this.isStopped) {
      return;
    }
    for (let chunkIndex = fromChunk; chunkIndex < totalChunks; chunkIndex++) {
      await this.waitUntilResumed();
      if (this.isStopped) {
        return;
      }
      if (channel && channel.bufferedAmount > HIGH_WATERMARK_BYTES) {
        await waitForBufferDrain(channel);
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const payload = await readSlice(file, start, end);
      checksum.update(payload);
      this.conn.send(encodeChunk(fileIndex, chunkIndex, payload));

      this.metrics?.recordBytes(payload.length, position);
      this.emitMetrics(this.metrics?.snapshot(position, file.name, (end / file.size) * 100));
    }

    if (!this.isStopped) {
      this.send({ type: 'FILE_COMPLETE', payload: { fileIndex, checksum: checksum.digest() } });
    }
  }
}
