import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { TransferSummary } from '../components/TransferSummary';
import { fireCelebration } from '../services/confetti';
import type { TransferMetrics } from '../types/transfer';

// canvas-confetti needs a real canvas; only whether it fires matters here
vi.mock('../services/confetti', () => ({
  fireCelebration: vi.fn(),
}));

const files = [
  { name: 'a.bin', size: 1024 * 1024 },
  { name: 'b.bin', size: 1024 * 1024 },
];

function metrics(overrides: Partial<TransferMetrics> = {}): TransferMetrics {
  return {
    currentSpeed: 1024 * 1024,
    averageSpeed: 1024 * 1024,
    elapsedSeconds: 2,
    etaSeconds: 30,
    bytesTransferred: 1024 * 1024,
    totalBytes: 2 * 1024 * 1024,
    overallPercent: 50,
    currentFileIndex: 1,
    totalFiles: 2,
    currentFileName: 'b.bin',
    currentFilePercent: 0,
    fileSeconds: [1.6],
    ...overrides,
  };
}

function renderSummary(props: Partial<ComponentProps<typeof TransferSummary>> = {}) {
  render(<TransferSummary metrics={metrics()} files={files} isPaused={false} queuePosition={null} completion={null} {...props} />);
  return screen.getByTestId('transfer-summary').textContent;
}

describe('TransferSummary', () => {
  beforeEach(() => {
    vi.mocked(fireCelebration).mockClear();
  });

  it('shows how far the download is, how fast it goes and how long is left', () => {
    const text = renderSummary();

    expect(screen.getByTestId('overall-percent').textContent).toBe('50%');
    expect(text).toContain('Receiving');
    expect(text).toContain('1 MB/s');
    expect(text).toMatch(/left/);
  });

  it('shows the place in line while waiting for the sender', () => {
    const text = renderSummary({ queuePosition: 2 });

    expect(text).toContain('In line');
    expect(text).toContain('1 ahead of you');
  });

  it('shows the totals once done, and celebrates', () => {
    const text = renderSummary({ metrics: metrics({ overallPercent: 100 }), completion: { corruptedFiles: [] } });

    expect(text).toContain('Done');
    expect(text).toContain('2 MB in 2s');
    expect(fireCelebration).toHaveBeenCalledTimes(1);
  });

  it('flags corrupted files and does not celebrate', () => {
    const text = renderSummary({ completion: { corruptedFiles: ['album/a.bin'] } });

    expect(text).toMatch(/1 file may be corrupted/);
    expect(fireCelebration).not.toHaveBeenCalled();
  });

  it('says it is reconnecting while a cut-off download waits for the sender', () => {
    expect(renderSummary({ isReconnecting: true })).toContain('Reconnecting…');
  });
});
