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
  elapsedSeconds: 1,
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
    requireApproval: false,
    onRequireApprovalChange: () => {},
    isShared: false,
    onCreateLink: () => {},
    onUpdateSharing: () => {},
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

  it('asks how to share only after the files are chosen, and shows the link only once created', () => {
    const onCreateLink = vi.fn();
    renderSenderView({ files: [queuedFile], onCreateLink });
    expect(screen.queryByTestId('create-link')).toBeNull();
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();

    fireEvent.click(screen.getByTestId('share-files'));
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();
    fireEvent.click(screen.getByTestId('create-link'));

    expect(onCreateLink).toHaveBeenCalledTimes(1);
  });

  it('lets the sender go back from the sharing options to edit the files', () => {
    renderSenderView({ files: [queuedFile] });
    fireEvent.click(screen.getByTestId('share-files'));

    fireEvent.click(screen.getByTestId('edit-files'));

    expect(screen.getByTestId('pick-files')).toBeDefined();
  });

  it('copies a link that carries the room key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSenderView({ files: [queuedFile], isShared: true });

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?room=DW-ABC234#key=link-key$/));
  });

  it('shows that the receiver is choosing where to save, while files can still change', () => {
    const onCancelTransfer = vi.fn();
    renderSenderView({ transferState: 'awaiting_receiver', files: [queuedFile], isShared: true, onCancelTransfer });

    expect(screen.getByText(/choosing where to save/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancelTransfer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('edit-files'));
    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByTestId('pick-files')).toBeDefined();
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

  it('offers receiving by code on the landing page', () => {
    const onSwitchToReceive = vi.fn();
    renderSenderView({ onSwitchToReceive });

    fireEvent.click(screen.getByRole('button', { name: /receive files/i }));
    expect(onSwitchToReceive).toHaveBeenCalledTimes(1);
  });

  it('stops offering to receive once files are queued', () => {
    renderSenderView({ files: [queuedFile], onSwitchToReceive: () => {} });

    expect(screen.queryByRole('button', { name: /receive files/i })).toBeNull();
  });

  it('lists every file with its progress while a multi-file transfer runs', () => {
    const second: TransferFile = { ...queuedFile, id: 'f2', name: 'notes.txt', type: 'text/plain' };
    renderSenderView({ transferState: 'transferring', transferMetrics: metrics, files: [queuedFile, second] });

    expect(document.querySelector('[data-status="active"]')?.textContent).toContain('report.pdf');
    expect(document.querySelector('[data-status="pending"]')?.textContent).toContain('notes.txt');
  });

  it('heads the queue with just the file count and total size', () => {
    renderSenderView({ files: [queuedFile] });

    expect(screen.getByText('1 file · 2 KB')).toBeDefined();
    expect(screen.queryByText(/ready to send/i)).toBeNull();
  });

  it('explains why the room code changed', () => {
    renderSenderView({ files: [queuedFile], isShared: true, roomNotice: 'This is a new room.' });

    expect(screen.getByText('This is a new room.')).toBeDefined();
  });

  it('summarises only the files the receiver chose', () => {
    const second: TransferFile = { ...queuedFile, id: 'f2', name: 'notes.txt', type: 'text/plain' };
    renderSenderView({ transferState: 'completed', files: [queuedFile, second], receiverFileIndices: [1] });

    expect(screen.getByText(/^1 file · /)).toBeDefined();
  });

  describe('changing how files are shared after the link is out', () => {
    function editSharing(overrides: Partial<ComponentProps<typeof SenderView>> = {}) {
      const onUpdateSharing = vi.fn();
      renderSenderView({ files: [queuedFile], isShared: true, onUpdateSharing, ...overrides });
      fireEvent.click(screen.getByTestId('edit-sharing'));
      return { onUpdateSharing };
    }

    it('asks whether a stricter setting should also stop the current receiver', () => {
      const { onUpdateSharing } = editSharing({ transferState: 'awaiting_receiver' });

      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 1234/i), { target: { value: '1234' } });
      fireEvent.click(screen.getByTestId('save-sharing'));
      expect(onUpdateSharing).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('apply-to-new'));
      expect(onUpdateSharing).toHaveBeenCalledWith({ pin: '1234', requireApproval: false }, 'new');
    });

    it('can apply a stricter setting to the current receiver too', () => {
      const { onUpdateSharing } = editSharing({ transferState: 'awaiting_receiver' });

      fireEvent.click(screen.getByRole('checkbox', { name: /ask me before anyone connects/i }));
      fireEvent.click(screen.getByTestId('save-sharing'));
      fireEvent.click(screen.getByTestId('apply-now'));

      expect(onUpdateSharing).toHaveBeenCalledWith({ pin: '', requireApproval: true }, 'now');
    });

    it('saves without asking when nobody is connected or the change only loosens things', () => {
      const { onUpdateSharing } = editSharing({ pin: '1234', transferState: 'awaiting_receiver' });

      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));
      fireEvent.click(screen.getByTestId('save-sharing'));

      expect(onUpdateSharing).toHaveBeenCalledWith({ pin: '', requireApproval: false }, 'new');
      expect(screen.queryByTestId('apply-now')).toBeNull();
    });
  });

  describe('editing files after sharing', () => {
    it('warns before removing a file from what a connected receiver is choosing from', () => {
      const onRemoveFile = vi.fn();
      renderSenderView({ files: [queuedFile], isShared: true, transferState: 'awaiting_receiver', onRemoveFile });
      fireEvent.click(screen.getByTestId('edit-files'));

      fireEvent.click(screen.getByTitle('Remove report.pdf'));
      expect(onRemoveFile).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(onRemoveFile).toHaveBeenCalledWith('f1');
    });

    it('warns that clearing everything after sharing replaces the link', () => {
      const onClearFiles = vi.fn();
      renderSenderView({ files: [queuedFile], isShared: true, onClearFiles });
      fireEvent.click(screen.getByTestId('edit-files'));

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
      expect(onClearFiles).not.toHaveBeenCalled();
      expect(screen.getByText(/link stops working/i)).toBeDefined();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(onClearFiles).toHaveBeenCalledTimes(1);
    });

    it('shows the PIN in the sharing summary so it can be passed on', () => {
      renderSenderView({ files: [queuedFile], isShared: true, pin: '2468' });

      expect(screen.getByText(/PIN 2468/)).toBeDefined();
    });

    it('removes straight away when nobody is connected, noting the link shows the change', () => {
      const onRemoveFile = vi.fn();
      renderSenderView({ files: [queuedFile], isShared: true, onRemoveFile });
      fireEvent.click(screen.getByTestId('edit-files'));

      expect(screen.getByText(/link is live/i)).toBeDefined();
      fireEvent.click(screen.getByTitle('Remove report.pdf'));

      expect(onRemoveFile).toHaveBeenCalledWith('f1');
    });
  });
});
