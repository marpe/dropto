import type { DataConnection } from 'peerjs';
import type { ControlMessage, DownloadInterruption, ManifestFile, ReceiverEvents, TransferManifest } from '../../types/transfer';
import { FastStreamingChecksum } from '../checksum';
import { chooseWriterFactory } from '../storage';
import type { StorageWriter, WriterFactory } from '../storage';
import { TransferPeer } from './peer';
import { decodeChunk } from './protocol';
import type { DeviceIntroduction } from '../../utils/deviceInfo';

/** A file cut off by a dropped connection, still open, for the next connection's receiver to carry on with. */
export interface ResumePoint {
  createWriter: WriterFactory;
  writer: StorageWriter;
  /** Covers bytes 0..receivedBytes */
  checksum: FastStreamingChecksum;
  fileId: string;
  fileSize: number;
  nextChunk: number;
  receivedBytes: number;
  /** The cut-off file first, then the rest of the download not finished yet */
  remainingIds: string[];
}

export interface ReceiverOptions {
  /** Picks where files are written; must run inside a user gesture (file pickers). */
  chooseStorage?: (files: ManifestFile[]) => Promise<WriterFactory | null>;
  /** Key from the sender's share link; lets the sender admit this receiver without asking */
  shareKey?: string | null;
  /** Device and time zone, so the sender can tell receivers apart */
  introduction?: DeviceIntroduction;
  /** A download cut off on an earlier connection, carried on once this one's manifest arrives */
  resumeFrom?: ResumePoint;
}

/** Receives a manifest, then writes each file to the chosen storage while verifying it. */
export class TransferReceiver extends TransferPeer<ReceiverEvents> {
  private readonly chooseStorage: (files: ManifestFile[]) => Promise<WriterFactory | null>;
  private manifest: TransferManifest | null = null;
  private createWriter: WriterFactory | null = null;
  // Manifest indices being received, in order; the whole manifest unless the user picked a subset
  private selection: number[] = [];
  private writer: StorageWriter | null = null;
  private checksum = new FastStreamingChecksum();
  private fileIndex = 0;
  private receivedBytesForFile = 0;
  private expectedChunkIndex = 0;
  // Guards captureInterruption: a dropped connection while the next file's save picker is still open must not
  // hand back a writer whose prepare() never finished
  private isFileStarted = false;
  private resumeFrom: ResumePoint | null;

  constructor(
    conn: DataConnection,
    events: ReceiverEvents,
    { chooseStorage = chooseWriterFactory, shareKey = null, introduction, resumeFrom }: ReceiverOptions = {}
  ) {
    super(conn, events);
    this.chooseStorage = chooseStorage;
    this.resumeFrom = resumeFrom ?? null;
    // Always the first message: the sender decides between auto-admitting and asking
    this.send({
      type: 'HELLO',
      payload: {
        shareKey,
        ...(introduction?.device && { device: introduction.device }),
        ...(introduction?.timeZone && { timeZone: introduction.timeZone }),
        ...(introduction?.sessionId && { sessionId: introduction.sessionId }),
        ...(introduction?.formFactor && { formFactor: introduction.formFactor }),
        ...(introduction?.model && { model: introduction.model }),
        ...(introduction?.storage && { storage: introduction.storage }),
      },
    });
  }

  public submitPin(pin: string) {
    this.send({ type: 'AUTH_RESPONSE', payload: { pin } });
  }

  /**
   * Picks the save destination once (inside the user's click) and requests the first file.
   * `fileIndices` limits the download to those manifest entries; omitted, every file is received.
   */
  public async startReceiving(fileIndices?: number[]): Promise<boolean> {
    const manifest = this.manifest;
    if (!manifest || manifest.files.length === 0) {
      return false;
    }
    const selection = fileIndices
      ? [...new Set(fileIndices)]
          .filter((index) => Number.isInteger(index) && index >= 0 && index < manifest.files.length)
          .sort((a, b) => a - b)
      : manifest.files.map((_, index) => index);
    if (selection.length === 0) {
      return false;
    }
    const selectedFiles = selection.map((index) => manifest.files[index]);
    const createWriter = await this.chooseStorage(selectedFiles);
    // The sender changed the list while the picker was open; the choice may not fit it (e.g. one-file dialog)
    if (!createWriter || this.manifest !== manifest || this.isStopped) {
      return false;
    }
    this.createWriter = createWriter;
    this.selection = selection;
    this.beginTransfer(
      selectedFiles.reduce((sum, file) => sum + file.size, 0),
      selectedFiles.length
    );
    // Only a subset needs announcing, so senders without selection support still work for full downloads
    if (selection.length < manifest.files.length) {
      this.send({ type: 'FILE_SELECTION', payload: { fileIndices: selection } });
    }
    return this.startFile(selection[0]);
  }

  protected async handleMessage(message: ControlMessage) {
    switch (message.type) {
      case 'MANIFEST':
        // The sender may refine the list while this side is choosing; never during a download
        if (this.createWriter) {
          throw new Error('The sender changed the file list after the download started');
        }
        this.manifest = message.payload;
        this.events.onManifest?.(message.payload);
        if (this.resumeFrom) {
          const resume = this.resumeFrom;
          this.resumeFrom = null;
          this.resume(resume, message.payload);
        }
        return;
      case 'AUTH_REQUEST':
        this.events.onPinRequired?.(message.payload);
        return;
      case 'QUEUED':
        this.events.onQueued?.(message.payload.position);
        return;
      case 'FILE_COMPLETE':
        await this.finishFile(message.payload.fileIndex, message.payload.checksum);
        return;
      default:
        throw new Error(`Unexpected ${message.type} message from the sender`);
    }
  }

  protected async handleChunk(buffer: ArrayBuffer) {
    const file = this.manifest?.files[this.fileIndex];
    if (!this.writer || !file) {
      throw new Error('Received file data before it was requested');
    }
    const { fileIndex, chunkIndex, payload } = decodeChunk(buffer);

    // Validate against the manifest before anything touches the checksum or disk
    if (fileIndex !== this.fileIndex) {
      throw new Error(`Received data for file #${fileIndex} while receiving file #${this.fileIndex}`);
    }
    if (chunkIndex !== this.expectedChunkIndex) {
      throw new Error(`Received chunk ${chunkIndex} of ${file.name}, expected chunk ${this.expectedChunkIndex}`);
    }
    if (this.receivedBytesForFile + payload.length > file.size) {
      throw new Error(`Received more data than declared for ${file.name}`);
    }

    this.checksum.update(payload);
    this.expectedChunkIndex++;
    this.receivedBytesForFile += payload.length;
    // Counted before the write finishes: a cut meanwhile keeps the stream open and this write lands on it
    const writing = this.writer.writeChunk(payload);

    const position = this.selection.indexOf(fileIndex);
    this.metrics?.recordBytes(payload.length, position);
    this.emitMetrics(this.metrics?.snapshot(position, file.name, (this.receivedBytesForFile / file.size) * 100));
    await writing;
  }

  protected onStop() {
    this.writer?.abort();
    this.writer = null;
  }

  protected onDownloadFinished() {
    // The next download asks where to save again and may come from an updated list
    this.createWriter = null;
  }

  protected captureInterruption(): DownloadInterruption {
    const interruption = super.captureInterruption();
    const manifest = this.manifest;
    const file = manifest?.files[this.fileIndex];
    if (!manifest || !file || !this.writer || !this.createWriter || !this.isFileStarted) {
      return interruption;
    }
    const position = this.selection.indexOf(this.fileIndex);
    const resume: ResumePoint = {
      createWriter: this.createWriter,
      writer: this.writer,
      checksum: this.checksum,
      fileId: file.id,
      fileSize: file.size,
      nextChunk: this.expectedChunkIndex,
      receivedBytes: this.receivedBytesForFile,
      remainingIds: this.selection.slice(position).map((index) => manifest.files[index].id),
    };
    // Handed over open: stopping must not abort it
    this.writer = null;
    return { ...interruption, resume };
  }

  private async startFile(fileIndex: number): Promise<boolean> {
    const file = this.manifest?.files[fileIndex];
    if (!file || !this.createWriter) {
      return false;
    }
    this.fileIndex = fileIndex;
    this.receivedBytesForFile = 0;
    this.expectedChunkIndex = 0;
    this.checksum = new FastStreamingChecksum();
    this.isFileStarted = false;
    // Immediate update so the UI switches to the progress view before the first chunk arrives
    this.emitMetrics(this.metrics?.snapshot(this.selection.indexOf(fileIndex), file.name, 0, { isForced: true }));

    try {
      const writer = this.createWriter(file);
      this.writer = writer;
      const isPrepared = await writer.prepare(file.name, file.size);
      if (this.isStopped) {
        // Stopped while the file was being opened (never a resume point: it had not started), so close it again
        void writer.abort();
        return false;
      }
      if (!isPrepared) {
        this.writer = null;
        return false;
      }
    } catch (err) {
      this.failTransfer(new Error(`Failed to prepare disk storage: ${err instanceof Error ? err.message : String(err)}`));
      return false;
    }
    this.isFileStarted = true;
    this.send({ type: 'FILE_START', payload: { fileIndex } });
    return true;
  }

  /**
   * Carries on a download cut off on an earlier connection: the same file, still open, from its next chunk, then
   * the rest still offered. Only when that file is still offered unchanged and still comes first.
   */
  private resume(point: ResumePoint, manifest: TransferManifest) {
    const indexOf = new Map(manifest.files.map((file, index) => [file.id, index]));
    const current = indexOf.get(point.fileId);
    const selection = point.remainingIds.flatMap((id) => indexOf.get(id) ?? []).sort((a, b) => a - b);
    if (current === undefined || manifest.files[current].size !== point.fileSize || selection[0] !== current) {
      void point.writer.abort();
      this.events.onResumeFailed?.();
      return;
    }
    const files = selection.map((index) => manifest.files[index]);
    this.createWriter = point.createWriter;
    this.selection = selection;
    this.writer = point.writer;
    this.checksum = point.checksum;
    this.fileIndex = current;
    this.expectedChunkIndex = point.nextChunk;
    this.receivedBytesForFile = point.receivedBytes;
    this.isFileStarted = true;
    this.beginTransfer(
      files.reduce((sum, file) => sum + file.size, 0),
      files.length,
      point.receivedBytes
    );
    this.events.onResumed?.(selection);
    const file = manifest.files[current];
    const percent = file.size > 0 ? (point.receivedBytes / file.size) * 100 : 0;
    this.emitMetrics(this.metrics?.snapshot(0, file.name, percent, { isForced: true }));
    if (selection.length < manifest.files.length) {
      this.send({ type: 'FILE_SELECTION', payload: { fileIndices: selection } });
    }
    this.send({ type: 'FILE_START', payload: { fileIndex: current, fromChunk: point.nextChunk } });
  }

  private async finishFile(fileIndex: number, expectedChecksum: string) {
    if (fileIndex !== this.fileIndex || !this.writer) {
      throw new Error(`Sender completed file #${fileIndex} while receiving file #${this.fileIndex}`);
    }
    const isVerified = this.checksum.digest().toLowerCase() === expectedChecksum.toLowerCase();
    await this.writer.finalize();
    this.writer = null;
    if (this.isStopped) {
      // Stopped meanwhile: the next file must not be opened
      return;
    }

    this.send({ type: 'FILE_ACK', payload: { fileIndex, isVerified } });
    this.recordVerification(this.manifest?.files[fileIndex], isVerified);
    this.events.onFileComplete?.(fileIndex, isVerified);

    const nextIndex = this.selection[this.selection.indexOf(fileIndex) + 1];
    if (nextIndex !== undefined) {
      await this.startFile(nextIndex);
    } else {
      this.completeTransfer();
    }
  }
}
