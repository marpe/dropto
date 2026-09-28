import { describe, it, expect } from 'vitest';
import { createInitialSenderState, senderReducer } from '../hooks/senderState';
import type { SenderSessionState } from '../hooks/senderState';
import type { TransferFile, TransferMetrics } from '../types/transfer';

const file = (id: string, size: number): TransferFile => ({
  id,
  name: `${id}.bin`,
  size,
  type: 'application/octet-stream',
  rawFile: new File([new Uint8Array(size)], `${id}.bin`),
});

const metrics = (bytesTransferred: number): TransferMetrics => ({
  currentSpeed: 0,
  averageSpeed: 0,
  elapsedSeconds: 1,
  etaSeconds: 0,
  bytesTransferred,
  totalBytes: 300,
  overallPercent: 0,
  currentFileIndex: 1,
  totalFiles: 2,
  currentFileName: 'b.bin',
  currentFilePercent: 50,
  fileSeconds: [1],
});

function downloading(startBytes = 0): SenderSessionState {
  const details = { device: null, timeZone: null, ip: null };
  let state = senderReducer(createInitialSenderState(), { type: 'FILES_ADDED', files: [file('a', 100), file('b', 200)] });
  state = senderReducer(state, { type: 'RECEIVER_ADMITTED', peerId: 'p1', details, atMs: 0 });
  state = senderReducer(state, { type: 'RECEIVER_STARTED', peerId: 'p1', fileIndices: [0, 1], startBytes });
  return senderReducer(state, { type: 'METRICS', peerId: 'p1', metrics: metrics(startBytes + 150) });
}

describe('senderReducer: a download cut off by a dropped connection', () => {
  it('keeps the progress on screen and counts the files finished before the cut as sent', () => {
    const state = senderReducer(downloading(), { type: 'RECEIVER_INTERRUPTED', peerId: 'p1', finishedCount: 1, corruptedFiles: [] });

    const [receiver] = state.receivers;
    expect(receiver.stage).toBe('interrupted');
    expect(receiver.metrics?.bytesTransferred).toBe(150);
    expect(receiver.bytesSent).toBe(150);
    expect(receiver.sentFiles.map((sent) => sent.id)).toEqual(['a']);
    expect(Object.keys(receiver.finishedFiles)).toEqual(['a']);
  });

  it('does not count the same bytes again when it then fails', () => {
    let state = senderReducer(downloading(), { type: 'RECEIVER_INTERRUPTED', peerId: 'p1', finishedCount: 1, corruptedFiles: [] });
    state = senderReducer(state, { type: 'RECEIVER_FAILED', peerId: 'p1', error: 'Connection lost' });

    expect(state.receivers[0].bytesSent).toBe(150);
  });

  it('does not count the same bytes again when they come back and drop before carrying on', () => {
    let state = senderReducer(downloading(), { type: 'RECEIVER_INTERRUPTED', peerId: 'p1', finishedCount: 1, corruptedFiles: [] });
    state = senderReducer(state, { type: 'RECEIVER_RESUMED', fromPeerId: 'p1', peerId: 'p1-again' });
    state = senderReducer(state, {
      type: 'RECEIVER_ADMITTED',
      peerId: 'p1-again',
      details: { device: null, timeZone: null, ip: null },
      atMs: 1,
    });
    state = senderReducer(state, { type: 'RECEIVER_INTERRUPTED', peerId: 'p1-again', finishedCount: 0, corruptedFiles: [] });

    const [receiver] = state.receivers;
    expect(receiver.stage).toBe('interrupted');
    expect(receiver.bytesSent).toBe(150);
    expect(receiver.sentFiles.map((sent) => sent.id)).toEqual(['a']);
  });

  it('counts a download carried on from partway only for what it sent', () => {
    let state = senderReducer(downloading(), { type: 'RECEIVER_INTERRUPTED', peerId: 'p1', finishedCount: 1, corruptedFiles: [] });
    state = senderReducer(state, { type: 'RECEIVER_STARTED', peerId: 'p1', fileIndices: [1], startBytes: 50 });
    state = senderReducer(state, { type: 'RECEIVER_COMPLETED', peerId: 'p1', result: { corruptedFiles: [] }, atMs: 1 });

    // a (100) + b (200), each counted once
    expect(state.receivers[0].bytesSent).toBe(300);
  });
});
