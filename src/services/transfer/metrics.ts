import type { TransferMetrics } from '../../types/transfer';

const SPEED_WINDOW_MS = 3_000;
// Every chunk would otherwise trigger a React render (~1,600/s at 100 MB/s)
const METRICS_INTERVAL_MS = 200;

interface SpeedSample {
  timestampMs: number;
  bytes: number;
}

interface SnapshotOptions {
  isForced?: boolean;
}

/** Tracks throughput for one transfer and produces throttled progress snapshots. */
export class TransferMetricsTracker {
  private readonly totalBytes: number;
  private readonly totalFiles: number;
  private readonly now: () => number;
  private readonly startBytes: number;
  // Set by the first byte: time spent before that (PIN entry, the save dialog) is not transfer time
  private startedTimestampMs: number | null = null;
  private bytesTransferred = 0;
  private samples: SpeedSample[] = [];
  private lastSnapshotTimestampMs: number | null = null;
  // First and latest byte per file position, for how long each file took
  private fileSpans: { firstMs: number; lastMs: number }[] = [];

  constructor(totalBytes: number, totalFiles: number, now: () => number = Date.now, startBytes = 0) {
    this.totalBytes = totalBytes;
    this.totalFiles = totalFiles;
    this.now = now;
    this.startBytes = startBytes;
    // A download carried on after a dropped connection starts where it stopped
    this.bytesTransferred = startBytes;
  }

  /** `position` is the file's place in this transfer (not its manifest index). */
  public recordBytes(bytes: number, position = 0) {
    const timestampMs = this.now();
    this.startedTimestampMs ??= timestampMs;
    const span = this.fileSpans[position];
    this.fileSpans[position] = { firstMs: span?.firstMs ?? timestampMs, lastMs: timestampMs };
    this.bytesTransferred += bytes;
    this.samples.push({ timestampMs, bytes });
    const cutoffMs = timestampMs - SPEED_WINDOW_MS;
    const firstRecentIndex = this.samples.findIndex((sample) => sample.timestampMs >= cutoffMs);
    if (firstRecentIndex > 0) {
      this.samples = this.samples.slice(firstRecentIndex);
    }
  }

  /** Returns null when throttled; forced snapshots and a file reaching 100% always come through. */
  public snapshot(
    fileIndex: number,
    fileName: string,
    filePercent: number,
    { isForced = false }: SnapshotOptions = {}
  ): TransferMetrics | null {
    const nowMs = this.now();
    const isThrottled =
      this.lastSnapshotTimestampMs !== null && nowMs - this.lastSnapshotTimestampMs < METRICS_INTERVAL_MS;
    if (isThrottled && !isForced && filePercent < 100) {
      return null;
    }
    this.lastSnapshotTimestampMs = nowMs;

    const currentSpeed = this.currentSpeed();
    const elapsedSeconds = this.startedTimestampMs === null ? 0 : (nowMs - this.startedTimestampMs) / 1000;
    const remainingBytes = Math.max(this.totalBytes - this.bytesTransferred, 0);
    return {
      currentSpeed,
      averageSpeed: elapsedSeconds > 0 ? (this.bytesTransferred - this.startBytes) / elapsedSeconds : 0,
      elapsedSeconds,
      etaSeconds: currentSpeed > 0 ? Math.round(remainingBytes / currentSpeed) : 0,
      bytesTransferred: this.bytesTransferred,
      totalBytes: this.totalBytes,
      overallPercent: this.totalBytes > 0 ? (this.bytesTransferred / this.totalBytes) * 100 : 0,
      currentFileIndex: fileIndex,
      totalFiles: this.totalFiles,
      currentFileName: fileName,
      currentFilePercent: filePercent,
      fileSeconds: Array.from(this.fileSpans, (span) => (span ? (span.lastMs - span.firstMs) / 1000 : 0)),
    };
  }

  private currentSpeed(): number {
    if (this.samples.length < 2) {
      return 0;
    }
    const durationSeconds = (this.samples[this.samples.length - 1].timestampMs - this.samples[0].timestampMs) / 1000;
    if (durationSeconds <= 0) {
      return 0;
    }
    return this.samples.reduce((sum, sample) => sum + sample.bytes, 0) / durationSeconds;
  }
}
