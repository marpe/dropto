import type { DataConnection } from 'peerjs';
import type { ControlMessage, NamedFile, TransferEvents, TransferMetrics } from '../../types/transfer';
import { displayPath } from '../../utils/filePath';
import { TransferMetricsTracker } from './metrics';
import { parseControlMessage, sendControlMessage, toArrayBuffer } from './protocol';

/**
 * Protocol plumbing shared by both ends of one transfer over one connection: ordered message
 * handling, pause/cancel/error propagation, disconnect detection and completion bookkeeping.
 */
export abstract class TransferPeer<Events extends TransferEvents> {
  protected readonly conn: DataConnection;
  protected readonly events: Events;
  protected metrics: TransferMetricsTracker | null = null;
  protected isStopped = false;
  private paused = false;
  // Resolved on resume or stop; waiting on an event (not a timer) keeps throttled background tabs responsive
  private resumeWaiters: (() => void)[] = [];
  // From a download's first file until it completes or stops; losing the connection in this window is a failure
  private isActive = false;
  private incomingQueue: Promise<void> = Promise.resolve();
  private corruptedFiles: string[] = [];

  constructor(conn: DataConnection, events: Events) {
    this.conn = conn;
    this.events = events;
    if (conn.dataChannel) {
      conn.dataChannel.binaryType = 'arraybuffer';
    }

    // One ordered queue: disk writes never overlap and messages are handled in arrival order
    conn.on('data', (data) => {
      this.incomingQueue = this.incomingQueue.then(() => this.receive(data)).catch((err) => this.failTransfer(err));
    });
    conn.on('close', () => this.handleConnectionLost());
  }

  public togglePause(): boolean {
    this.setPaused(!this.paused);
    this.send({ type: this.paused ? 'TRANSFER_PAUSE' : 'TRANSFER_RESUME' });
    return this.paused;
  }

  public cancel() {
    this.stop();
    this.send({ type: 'TRANSFER_CANCEL' });
  }

  protected abstract handleMessage(message: ControlMessage): Promise<void> | void;
  protected abstract handleChunk(buffer: ArrayBuffer): Promise<void>;

  /** Stop-time cleanup specific to one side (e.g. discarding a partial file). */
  protected onStop() {}

  /** Resets one side for the next download on the same connection. */
  protected onDownloadFinished() {}

  /** Resolves at once unless paused; otherwise when either side resumes or the transfer stops. */
  protected waitUntilResumed(): Promise<void> {
    if (!this.paused || this.isStopped) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  protected send(message: ControlMessage) {
    sendControlMessage(this.conn, message);
  }

  protected beginTransfer(totalBytes: number, totalFiles: number) {
    this.isActive = true;
    this.corruptedFiles = [];
    this.metrics = new TransferMetricsTracker(totalBytes, totalFiles);
  }

  protected recordVerification(file: NamedFile | undefined, isVerified: boolean) {
    if (!isVerified && file) {
      this.corruptedFiles.push(displayPath(file));
    }
  }

  protected completeTransfer() {
    this.isActive = false;
    this.onDownloadFinished();
    this.events.onAllCompleted?.({ corruptedFiles: [...this.corruptedFiles] });
  }

  protected emitMetrics(metrics: TransferMetrics | null | undefined) {
    if (metrics) {
      this.events.onMetrics?.(metrics);
    }
  }

  /** Local fatal error: tell the peer, stop, and surface it to the UI. */
  protected failTransfer(err: unknown) {
    if (this.isStopped) {
      return;
    }
    console.error('Transfer failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    this.send({ type: 'ERROR', payload: { message } });
    this.stop();
    this.events.onError?.(message);
  }

  private stop() {
    this.isActive = false;
    this.isStopped = true;
    this.releaseResumeWaiters();
    this.onStop();
  }

  private setPaused(isPaused: boolean) {
    this.paused = isPaused;
    this.events.onPaused?.(isPaused);
    if (!isPaused) {
      this.releaseResumeWaiters();
    }
  }

  private releaseResumeWaiters() {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  private async receive(data: unknown) {
    // After a cancel or failure, late messages must not resume or complete the transfer
    if (this.isStopped) {
      return;
    }
    const buffer = await toArrayBuffer(data);
    if (buffer) {
      await this.handleChunk(buffer);
      return;
    }
    const message = typeof data === 'string' ? parseControlMessage(data) : null;
    if (!message) {
      throw new Error('Received an invalid message from the peer');
    }
    await this.dispatch(message);
  }

  private async dispatch(message: ControlMessage) {
    switch (message.type) {
      case 'HELLO':
        // Introductions are read during connection setup, before a transfer exists
        return;
      case 'TRANSFER_PAUSE':
      case 'TRANSFER_RESUME':
        this.setPaused(message.type === 'TRANSFER_PAUSE');
        return;
      case 'TRANSFER_CANCEL':
        // The peer cancelled: stop without echoing the cancel back
        this.stop();
        this.events.onCancelled?.();
        return;
      case 'ERROR':
        this.stop();
        this.events.onError?.(message.payload.message);
        return;
      default:
        await this.handleMessage(message);
    }
  }

  private handleConnectionLost() {
    if (this.isStopped) {
      return;
    }
    if (!this.isActive) {
      this.stop();
      this.events.onPeerLeft?.();
      return;
    }
    this.stop();
    if (this.events.onConnectionLost) {
      this.events.onConnectionLost();
    } else {
      this.events.onError?.('Connection to peer lost');
    }
  }
}
