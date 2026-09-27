import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MetricsDashboard } from '../components/MetricsDashboard';
import { fireCelebration } from '../services/confetti';
import type { ManifestFile, TransferMetrics } from '../types/transfer';

// canvas-confetti needs a real canvas; only whether it fires matters here
vi.mock('../services/confetti', () => ({
  fireCelebration: vi.fn(),
}));

const files: ManifestFile[] = [
  { id: 'a', name: 'a.bin', relativePath: 'album/a.bin', size: 1024 * 1024, type: 'application/octet-stream' },
  { id: 'b', name: 'b.bin', size: 1024 * 1024, type: 'application/octet-stream' },
];

const finalMetrics: TransferMetrics = {
  currentSpeed: 0,
  averageSpeed: 1024 * 1024,
  elapsedSeconds: 2,
  etaSeconds: 0,
  bytesTransferred: 2 * 1024 * 1024,
  totalBytes: 2 * 1024 * 1024,
  overallPercent: 100,
  currentFileIndex: 1,
  totalFiles: 2,
  currentFileName: 'b.bin',
  currentFilePercent: 100,
  fileSeconds: [1.6, 0.3],
};

function renderFinished(overrides: Partial<ComponentProps<typeof MetricsDashboard>> = {}, corruptedFiles: string[] = []) {
  const onNext = vi.fn();
  render(
    <MetricsDashboard
      metrics={finalMetrics}
      files={files}
      isSender={true}
      isPaused={false}
      onTogglePause={() => {}}
      onCancel={() => {}}
      completion={{ corruptedFiles, actions: <button onClick={onNext}>Send to someone else</button> }}
      {...overrides}
    />
  );
  return { onNext };
}

const stat = (name: string) => screen.getByTestId(`stat-${name}`).querySelector('[data-stat-value]')?.textContent;

describe('MetricsDashboard once the transfer is done', () => {
  beforeEach(() => {
    vi.mocked(fireCelebration).mockClear();
  });

  it('stays on screen at 100%, with the totals, and celebrates', () => {
    renderFinished();

    expect(screen.getByTestId('overall-percent').textContent).toBe('100%');
    expect(stat('files')).toBe('2');
    expect(stat('size')).toBe('2 MB');
    expect(stat('time')).toBe('2s');
    expect(stat('speed')).toBe('1 MB/s');
    expect(fireCelebration).toHaveBeenCalledTimes(1);
  });

  it('shows every file finished with how long it took', () => {
    renderFinished();

    const rows = document.querySelectorAll('[data-status="done"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('2s');
    expect(rows[1].textContent).toContain('<1s');
  });

  it('offers what to do next instead of Pause and Cancel', () => {
    const { onNext } = renderFinished();

    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send to someone else' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('flags files that failed verification and does not celebrate', () => {
    renderFinished({}, ['album/a.bin']);

    expect(screen.getByText(/finished with errors/i)).toBeDefined();
    expect(document.querySelector('[data-status="corrupted"]')?.textContent).toContain('album/a.bin');
    expect(fireCelebration).not.toHaveBeenCalled();
  });
});
