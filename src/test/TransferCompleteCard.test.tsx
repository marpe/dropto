import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { TransferCompleteCard } from '../components/TransferCompleteCard';
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
};

function renderCard(overrides: Partial<ComponentProps<typeof TransferCompleteCard>> = {}) {
  const onAction = vi.fn();
  render(
    <TransferCompleteCard
      title="Transfer Complete!"
      actions={<button onClick={onAction}>Send More Files</button>}
      files={files}
      metrics={finalMetrics}
      corruptedFiles={[]}
      {...overrides}
    />
  );
  return { onAction };
}

describe('TransferCompleteCard', () => {
  beforeEach(() => {
    vi.mocked(fireCelebration).mockClear();
  });

  it('celebrates and summarises how much moved, how long it took and how fast', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Transfer Complete!' })).toBeDefined();
    expect(screen.getByText('2 files · 2 MB · 2s · 1 MB/s average')).toBeDefined();
    expect(fireCelebration).toHaveBeenCalledTimes(1);
  });

  it('lists every file with its outcome, flagging the corrupted ones', () => {
    const { onAction } = renderCard({ corruptedFiles: ['album/a.bin'] });

    expect(screen.queryByRole('heading', { name: 'Transfer Complete!' })).toBeNull();
    expect(document.querySelector('[data-status="corrupted"]')?.textContent).toContain('album/a.bin');
    expect(document.querySelector('[data-status="done"]')?.textContent).toContain('b.bin');
    expect(fireCelebration).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send More Files' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('still summarises a transfer too fast to have timing data', () => {
    renderCard({ files: [files[1]], metrics: null });

    expect(screen.getByText('1 file · 1 MB')).toBeDefined();
  });
});
