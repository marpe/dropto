import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { SenderView } from '../components/SenderView';
import type { TransferMetrics } from '../types/transfer';

const metrics: TransferMetrics = {
  currentSpeed: 1048576,
  averageSpeed: 1048576,
  etaSeconds: 10,
  bytesTransferred: 524288,
  totalBytes: 1048576,
  overallPercent: 50,
  currentFileIndex: 0,
  totalFiles: 1,
  currentFileName: 'movie.mkv',
  currentFilePercent: 50,
};

function renderSenderView(overrides: Partial<ComponentProps<typeof SenderView>> = {}) {
  const props: ComponentProps<typeof SenderView> = {
    roomCode: 'DW-ABC234',
    files: [],
    onAddFiles: () => {},
    onRemoveFile: () => {},
    onClearFiles: () => {},
    connectedPeerId: null,
    transferMetrics: null,
    transferState: 'waiting',
    pendingPeerId: null,
    onApprovePeer: () => {},
    onRejectPeer: () => {},
    onTogglePause: () => {},
    onCancelTransfer: () => {},
    pin: '',
    onPinChange: () => {},
    corruptedFiles: [],
    isPaused: false,
    errorMessage: null,
    onDismissError: () => {},
    onRetryRoom: () => {},
    ...overrides,
  };
  return render(<SenderView {...props} />);
}

describe('SenderView', () => {
  it('offers Resume while the transfer is paused', () => {
    renderSenderView({ transferState: 'transferring', transferMetrics: metrics, isPaused: true });

    expect(screen.getByRole('button', { name: /resume/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
  });

  it('shows why the transfer failed and returns to the file list', () => {
    const onDismissError = vi.fn();
    renderSenderView({
      transferState: 'failed',
      errorMessage: 'Connection to peer lost',
      onDismissError,
    });

    expect(screen.getByText('Connection to peer lost')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /back to files/i }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it('shows a room setup error with a retry instead of generating forever', () => {
    const onRetryRoom = vi.fn();
    renderSenderView({
      roomCode: '',
      errorMessage: 'Could not reach the signaling server',
      onRetryRoom,
    });

    expect(screen.getByText('Could not reach the signaling server')).toBeDefined();
    expect(screen.queryByText(/generating/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetryRoom).toHaveBeenCalledTimes(1);
  });
});
