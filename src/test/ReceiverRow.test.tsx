import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiverRow } from '../components/ReceiverRow';
import type { SenderReceiver } from '../types/sharing';
import { formatBytes } from '../utils/format';

const interrupted: SenderReceiver = {
  peerId: 'p1',
  details: { device: 'Chrome on Android', timeZone: null, ip: null },
  stage: 'interrupted',
  idleSinceMs: null,
  hasLeft: false,
  downloadFiles: [{ id: 'a', name: 'a.bin', size: 100, type: '' }],
  sentFiles: [],
  finishedFiles: {},
  bytesSent: 40,
  downloadStartBytes: 0,
  metrics: null,
  isPaused: false,
  error: null,
};

describe('ReceiverRow', () => {
  it('shows someone cut off mid-download as reconnecting, and lets the sender stop them', () => {
    render(<ReceiverRow receiver={interrupted} queuePosition={null} onStop={vi.fn()} onDismiss={vi.fn()} onTogglePause={vi.fn()} />);

    // jest-dom matchers aren't set up in this project; assert the same way other component tests do
    expect(screen.getByTestId('receiver-row').textContent).toContain('Reconnecting…');
    expect(screen.getByTitle('Stop download')).toBeDefined();
    expect(screen.queryByTitle('Pause')).toBeNull();
  });

  it('counts what a download carried on from partway already sent before the cut only once', () => {
    const mb = 1024 * 1024;
    const carriedOn: SenderReceiver = {
      ...interrupted,
      stage: 'transferring',
      downloadFiles: [{ id: 'a', name: 'a.bin', size: 40 * mb, type: '' }],
      // 20 MB went over before the cut; the download carried on from there and has sent 10 MB more
      bytesSent: 20 * mb,
      downloadStartBytes: 20 * mb,
      metrics: {
        currentSpeed: 0,
        averageSpeed: 0,
        elapsedSeconds: 1,
        etaSeconds: 1,
        bytesTransferred: 30 * mb,
        totalBytes: 40 * mb,
        overallPercent: 75,
        currentFileIndex: 0,
        totalFiles: 1,
        currentFileName: 'a.bin',
        currentFilePercent: 75,
        fileSeconds: [],
      },
    };

    render(<ReceiverRow receiver={carriedOn} queuePosition={null} onStop={vi.fn()} onDismiss={vi.fn()} onTogglePause={vi.fn()} />);

    expect(screen.getByTestId('bytes-sent').textContent).toBe(`${formatBytes(30 * mb)} sent`);
  });
});
