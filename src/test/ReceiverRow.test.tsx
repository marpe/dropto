import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiverRow } from '../components/ReceiverRow';
import type { SenderReceiver } from '../types/sharing';

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
});
