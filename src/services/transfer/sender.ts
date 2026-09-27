import type { DataConnection } from 'peerjs';
import type { ControlMessage, SenderEvents, TransferFile, TransferManifest } from '../../types/transfer';
import { FastStreamingChecksum } from '../checksum';
import { TransferPeer } from './peer';
import { CHUNK_SIZE, encodeChunk } from './protocol';

const HIGH_WATERMARK_BYTES = 1024 * 1024;
const LOW_WATERMARK_BYTES = 256 * 1024;
const DRAIN_TIMEOUT_MS = 2_000;
const PAUSE_POLL_MS = 100;
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
  // Once the receiver requests the first file, the file list can no longer change
  private hasReceiverStarted = false;

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
    this.beginTransfer(toManifest(files).totalBytes, files.length);

    if (pin) {
      this.send({ type: 'AUTH_REQUEST', payload: { attemptsLeft: MAX_PIN_ATTEMPTS, isIncorrect: false } });
    } else {
      this.sendManifest();
    }
  }

  /** Replaces the offered files while the receiver is still choosing; returns false once downloading began. */
  public updateFiles(files: TransferFile[]): boolean {
    if (this.hasReceiverStarted) {
      return false;
    }
    this.files = files;
    this.beginTransfer(toManifest(files).totalBytes, files.length);
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
      case 'FILE_START':
        if (!this.hasSentManifest) {
          throw new Error('Receiver requested files before authenticating');
        }
        if (!this.hasReceiverStarted) {
          this.hasReceiverStarted = true;
          this.events.onReceiverStarted?.();
        }
        // Not awaited: streaming a file must not block pause/cancel messages in the queue
        this.streamFile(message.payload.fileIndex).catch((err) => this.failTransfer(err));
        return;
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
    if (fileIndex === this.files.length - 1) {
      this.completeTransfer();
    }
  }

  private async streamFile(fileIndex: number) {
    const file = this.files[fileIndex];
    if (!file) {
      throw new Error(`Receiver requested unknown file #${fileIndex}`);
    }
    const checksum = new FastStreamingChecksum();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const channel = this.conn.dataChannel;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      while (this.isPaused && !this.isStopped) {
        await new Promise((resolve) => setTimeout(resolve, PAUSE_POLL_MS));
      }
      if (this.isStopped) {
        return;
      }
      if (channel && channel.bufferedAmount > HIGH_WATERMARK_BYTES) {
        await waitForBufferDrain(channel);
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const payload = new Uint8Array(await file.rawFile.slice(start, end).arrayBuffer());
      checksum.update(payload);
      this.conn.send(encodeChunk(fileIndex, chunkIndex, payload));

      this.metrics?.recordBytes(payload.length);
      this.emitMetrics(this.metrics?.snapshot(fileIndex, file.name, (end / file.size) * 100));
    }

    if (!this.isStopped) {
      this.send({ type: 'FILE_COMPLETE', payload: { fileIndex, checksum: checksum.digest() } });
    }
  }
}
