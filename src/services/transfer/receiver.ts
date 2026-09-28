import type { DataConnection } from 'peerjs';
import type { ControlMessage, ManifestFile, ReceiverEvents, TransferManifest } from '../../types/transfer';
import { FastStreamingChecksum } from '../checksum';
import { chooseWriterFactory } from '../storage';
import type { StorageWriter, WriterFactory } from '../storage';
import { TransferPeer } from './peer';
import { decodeChunk } from './protocol';
import type { DeviceIntroduction } from '../../utils/deviceInfo';

export interface ReceiverOptions {
  /** Picks where files are written; must run inside a user gesture (file pickers). */
  chooseStorage?: (files: ManifestFile[]) => Promise<WriterFactory | null>;
  /** Key from the sender's share link; lets the sender admit this receiver without asking */
  shareKey?: string | null;
  /** Device and time zone, so the sender can tell receivers apart */
  introduction?: DeviceIntroduction;
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

  constructor(
    conn: DataConnection,
    events: ReceiverEvents,
    { chooseStorage = chooseWriterFactory, shareKey = null, introduction }: ReceiverOptions = {}
  ) {
    super(conn, events);
    this.chooseStorage = chooseStorage;
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
    if (!createWriter || this.manifest !== manifest) {
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
    await this.writer.writeChunk(payload);
    this.expectedChunkIndex++;
    this.receivedBytesForFile += payload.length;

    const position = this.selection.indexOf(fileIndex);
    this.metrics?.recordBytes(payload.length, position);
    this.emitMetrics(this.metrics?.snapshot(position, file.name, (this.receivedBytesForFile / file.size) * 100));
  }

  protected onStop() {
    this.writer?.abort();
    this.writer = null;
  }

  protected onDownloadFinished() {
    // The next download asks where to save again and may come from an updated list
    this.createWriter = null;
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
    // Immediate update so the UI switches to the progress view before the first chunk arrives
    this.emitMetrics(this.metrics?.snapshot(this.selection.indexOf(fileIndex), file.name, 0, { isForced: true }));

    try {
      this.writer = this.createWriter(file);
      if (!(await this.writer.prepare(file.name, file.size))) {
        this.writer = null;
        return false;
      }
    } catch (err) {
      this.failTransfer(new Error(`Failed to prepare disk storage: ${err instanceof Error ? err.message : String(err)}`));
      return false;
    }
    this.send({ type: 'FILE_START', payload: { fileIndex } });
    return true;
  }

  private async finishFile(fileIndex: number, expectedChecksum: string) {
    if (fileIndex !== this.fileIndex || !this.writer) {
      throw new Error(`Sender completed file #${fileIndex} while receiving file #${this.fileIndex}`);
    }
    const isVerified = this.checksum.digest().toLowerCase() === expectedChecksum.toLowerCase();
    await this.writer.finalize();
    this.writer = null;

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
