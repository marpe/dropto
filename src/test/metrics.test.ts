import { describe, it, expect } from 'vitest';
import { TransferMetricsTracker } from '../services/transfer/metrics';

function createTracker(totalBytes: number, totalFiles = 1) {
  const clock = { nowMs: 0 };
  const tracker = new TransferMetricsTracker(totalBytes, totalFiles, () => clock.nowMs);
  return { tracker, clock };
}

describe('TransferMetricsTracker', () => {
  it('records how long each file took, from its first byte to its last', () => {
    const { tracker, clock } = createTracker(30, 2);
    tracker.recordBytes(10, 0);
    clock.nowMs = 2_000;
    tracker.recordBytes(10, 0);
    clock.nowMs = 3_000;
    tracker.recordBytes(5, 1);
    clock.nowMs = 3_500;
    tracker.recordBytes(5, 1);

    expect(tracker.snapshot(1, 'b.bin', 100)?.fileSeconds).toEqual([2, 0.5]);
  });

  it('reports overall progress, speed over the recent window and time remaining', () => {
    const { tracker, clock } = createTracker(10_000);
    tracker.recordBytes(1_000);
    clock.nowMs = 1_000;
    tracker.recordBytes(1_000);

    const metrics = tracker.snapshot(0, 'a.bin', 20);

    expect(metrics).toMatchObject({
      bytesTransferred: 2_000,
      totalBytes: 10_000,
      overallPercent: 20,
      currentSpeed: 2_000,
      etaSeconds: 4,
      currentFileIndex: 0,
      totalFiles: 1,
      currentFileName: 'a.bin',
      currentFilePercent: 20,
    });
  });

  it('forgets bytes older than the speed window', () => {
    const { tracker, clock } = createTracker(100_000);
    tracker.recordBytes(50_000);
    clock.nowMs = 10_000;
    tracker.recordBytes(1_000);
    clock.nowMs = 11_000;
    tracker.recordBytes(1_000);

    expect(tracker.snapshot(0, 'a.bin', 50)?.currentSpeed).toBe(2_000);
  });

  it('limits updates to one per interval, except forced ones and a file reaching 100%', () => {
    const { tracker, clock } = createTracker(1_000);

    expect(tracker.snapshot(0, 'a.bin', 10)).not.toBeNull();
    clock.nowMs = 50;
    expect(tracker.snapshot(0, 'a.bin', 20)).toBeNull();
    expect(tracker.snapshot(0, 'a.bin', 20, { isForced: true })).not.toBeNull();
    clock.nowMs = 60;
    expect(tracker.snapshot(0, 'a.bin', 100)).not.toBeNull();
    clock.nowMs = 300;
    expect(tracker.snapshot(1, 'b.bin', 5)).not.toBeNull();
  });

  it('reports zero speed and unknown remaining time before enough data arrives', () => {
    const { tracker } = createTracker(1_000);

    expect(tracker.snapshot(0, 'a.bin', 0)).toMatchObject({ currentSpeed: 0, etaSeconds: 0, overallPercent: 0 });
  });

  // The receiver may spend a minute in the save dialog; that is not transfer time
  it('times the transfer from its first byte, not from when it was offered', () => {
    const { tracker, clock } = createTracker(10_000);
    clock.nowMs = 60_000;
    tracker.recordBytes(5_000);
    clock.nowMs = 62_000;
    tracker.recordBytes(5_000);

    const metrics = tracker.snapshot(0, 'a.bin', 100);

    expect(metrics?.elapsedSeconds).toBe(2);
    expect(metrics?.averageSpeed).toBe(5_000);
  });

  it('carries on from bytes that arrived before, without counting them towards speed or time', () => {
    const clock = { nowMs: 0 };
    const tracker = new TransferMetricsTracker(10_000, 1, () => clock.nowMs, 6_000);
    clock.nowMs = 5_000;
    tracker.recordBytes(1_000);
    clock.nowMs = 6_000;
    tracker.recordBytes(1_000);

    expect(tracker.snapshot(0, 'a.bin', 80)).toMatchObject({
      bytesTransferred: 8_000,
      overallPercent: 80,
      currentSpeed: 2_000,
      averageSpeed: 2_000,
      elapsedSeconds: 1,
      etaSeconds: 1,
    });
  });
});
