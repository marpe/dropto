import { describe, it, expect } from 'vitest';
import { getFileProgress } from '../utils/transferProgress';
import type { TransferMetrics } from '../types/transfer';

const files = [{ name: 'a.txt' }, { name: 'b.txt', relativePath: 'docs/b.txt' }, { name: 'c.txt' }];

function metricsAt(currentFileIndex: number, currentFilePercent: number): TransferMetrics {
  return {
    currentSpeed: 0,
    averageSpeed: 0,
    elapsedSeconds: 0,
    etaSeconds: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    overallPercent: 0,
    currentFileIndex,
    totalFiles: files.length,
    currentFileName: files[currentFileIndex].name,
    currentFilePercent,
    fileSeconds: [3, 1.5, 0],
  };
}

describe('getFileProgress', () => {
  it('marks earlier files done with how long they took, the current one active and later ones pending', () => {
    expect(getFileProgress(files, metricsAt(1, 40), [], false)).toEqual([
      { status: 'done', seconds: 3 },
      { status: 'active', percent: 40 },
      { status: 'pending' },
    ]);
  });

  it('shows everything pending before the first data arrives', () => {
    expect(getFileProgress(files, null, [], false).map((progress) => progress.status)).toEqual([
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('flags files that failed verification once the transfer completes, matched by their path', () => {
    expect(getFileProgress(files, metricsAt(2, 100), ['docs/b.txt'], true)).toEqual([
      { status: 'done', seconds: 3 },
      { status: 'corrupted', seconds: 1.5 },
      { status: 'done', seconds: 0 },
    ]);
  });
});
