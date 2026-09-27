import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { SenderView } from '../components/SenderView';
import type { TransferFile, TransferMetrics } from '../types/transfer';

const queuedFile: TransferFile = {
  id: 'f1',
  name: 'report.pdf',
  size: 2048,
  type: 'application/pdf',
  rawFile: new File(['x'], 'report.pdf'),
};

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

function renderSenderViewProps(overrides: Partial<ComponentProps<typeof SenderView>> = {}): ComponentProps<typeof SenderView> {
  return {
    roomCode: 'DW-ABC234',
    shareKey: 'link-key',
    files: [],
    onAddFiles: () => {},
    onRemoveFile: () => {},
    onClearFiles: () => {},
    transferMetrics: null,
    transferState: 'waiting',
    pendingPeerId: null,
    isPendingPeerTrusted: false,
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
}

function renderSenderView(overrides: Partial<ComponentProps<typeof SenderView>> = {}) {
  return render(<SenderView {...renderSenderViewProps(overrides)} />);
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

  it('keeps the share box hidden until there is something to send', () => {
    const { rerender } = renderSenderView();
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();

    rerender(<SenderView {...renderSenderViewProps({ files: [queuedFile] })} />);
    expect(screen.getByRole('button', { name: /copy link/i })).toBeDefined();
  });

  it('copies a link that carries the room key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSenderView({ files: [queuedFile] });

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?room=DW-ABC234#key=link-key$/));
  });

  it('shows that the receiver is choosing where to save, while files can still change', () => {
    const onCancelTransfer = vi.fn();
    renderSenderView({ transferState: 'awaiting_receiver', files: [queuedFile], onCancelTransfer });

    expect(screen.getByText(/choosing where to save/i)).toBeDefined();
    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByRole('button', { name: /select files/i })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancelTransfer).toHaveBeenCalledTimes(1);
  });

  it('asks for files, not approval, when a receiver opened the link early', () => {
    renderSenderView({ pendingPeerId: 'receiver-1', isPendingPeerTrusted: true });

    expect(screen.getByText(/opened your link/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('marks queued files with an icon for their type', () => {
    const { container } = renderSenderView({ files: [queuedFile] });

    expect(container.querySelector('[data-file-kind="pdf"]')).not.toBeNull();
  });
});
