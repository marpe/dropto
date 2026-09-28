import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SenderView } from '../components/SenderView';
import type { SenderSession, SenderSessionState } from '../hooks/useSenderSession';
import { createInitialSenderState } from '../hooks/senderState';
import type { PendingPeer, SenderReceiver } from '../types/sharing';
import type { TransferFile } from '../types/transfer';

// canvas-confetti needs a real canvas, which jsdom lacks
vi.mock('../services/confetti', () => ({
  fireCelebration: vi.fn(),
}));

const queuedFile: TransferFile = {
  id: 'f1',
  name: 'report.pdf',
  size: 2048,
  type: 'application/pdf',
  rawFile: new File(['x'], 'report.pdf'),
};

const noDetails = { device: null, timeZone: null, ip: null };

const receiver: SenderReceiver = {
  peerId: 'receiver-1',
  details: noDetails,
  stage: 'choosing',
  idleSinceMs: Date.now(),
  hasLeft: false,
  downloadFiles: [],
  sentFiles: [],
  finishedFiles: {},
  bytesSent: 0,
  downloadStartBytes: 0,
  metrics: null,
  isPaused: false,
  error: null,
};

const pendingPeer: PendingPeer = { peerId: 'receiver-2', details: noDetails, isTrusted: false };

function renderSenderView(state: Partial<SenderSessionState>) {
  const session = {
    state: { ...createInitialSenderState(), roomCode: 'DT-ABC234', shareKey: 'link-key', files: [queuedFile], ...state },
    status: 'waiting',
    focus: null,
    restorableCount: 0,
    actions: {
      addFiles: vi.fn(),
      removeFiles: vi.fn(),
      restoreFiles: vi.fn(),
      clearFiles: vi.fn(),
      startOver: vi.fn(),
      togglePauseReceiver: vi.fn(),
      setSharingOptions: vi.fn(),
      createLink: vi.fn(),
      updateSharing: vi.fn(),
      stopSharing: vi.fn(),
      approvePeer: vi.fn(),
      rejectPeer: vi.fn(),
      stopReceiver: vi.fn(),
      dismissReceiver: vi.fn(),
      retryRoom: vi.fn(),
    },
  } as SenderSession;
  render(<SenderView session={session} />);
}

describe('WaitingForPeopleCard', () => {
  it('shows while the link is shared and nobody is connected', () => {
    renderSenderView({ isShared: true });

    expect(screen.getByTestId('waiting-for-people').getAttribute('role')).toBe('status');
  });

  it('is hidden before the link is shared', () => {
    renderSenderView({ isShared: false });

    expect(screen.queryByTestId('waiting-for-people')).toBeNull();
  });

  it('gives way to the people list once someone connects', () => {
    renderSenderView({ isShared: true, receivers: [receiver] });

    expect(screen.queryByTestId('waiting-for-people')).toBeNull();
    expect(screen.getByTestId('receiver-row')).toBeDefined();
  });

  it('is hidden while someone is waiting to be let in', () => {
    renderSenderView({ isShared: true, pendingPeers: [pendingPeer] });

    expect(screen.queryByTestId('waiting-for-people')).toBeNull();
  });
});
