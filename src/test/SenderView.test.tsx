import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SenderView } from '../components/SenderView';
import type { SenderSession, SenderSessionState } from '../hooks/useSenderSession';
import { createInitialSenderState } from '../hooks/senderState';
import type { SenderReceiver } from '../types/sharing';
import type { SenderStatus, TransferFile, TransferMetrics } from '../types/transfer';

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

function makeReceiver(overrides: Partial<SenderReceiver> = {}): SenderReceiver {
  return {
    peerId: 'receiver-1',
    number: 1,
    stage: 'choosing',
    fileIndices: null,
    metrics: null,
    isPaused: false,
    error: null,
    corruptedFiles: [],
    ...overrides,
  };
}

function makeActions(overrides: Partial<SenderSession['actions']> = {}): SenderSession['actions'] {
  return {
    addFiles: vi.fn(),
    removeFile: vi.fn(),
    clearFiles: vi.fn(),
    setSharingOptions: vi.fn(),
    createLink: vi.fn(),
    updateSharing: vi.fn(),
    stopSharing: vi.fn(),
    approvePeer: vi.fn(),
    rejectPeer: vi.fn(),
    togglePause: vi.fn(),
    cancel: vi.fn(),
    stopReceiver: vi.fn(),
    dismissReceiver: vi.fn(),
    dismissError: vi.fn(),
    retryRoom: vi.fn(),
    ...overrides,
  };
}

interface SessionOverrides {
  state?: Partial<SenderSessionState>;
  status?: SenderStatus;
  focus?: SenderReceiver | null;
  actions?: Partial<SenderSession['actions']>;
}

function renderSenderView(
  { state = {}, status = 'waiting', focus = null, actions = {} }: SessionOverrides = {},
  onSwitchToReceive?: () => void
) {
  const session = {
    state: { ...createInitialSenderState(), roomCode: 'DW-ABC234', shareKey: 'link-key', ...state },
    status,
    focus,
    actions: makeActions(actions),
  } as SenderSession;
  render(<SenderView session={session} onSwitchToReceive={onSwitchToReceive} />);
  return session.actions;
}

const shared = (state: Partial<SenderSessionState> = {}) => ({ files: [queuedFile], isShared: true, ...state });

describe('SenderView', () => {
  it('offers Resume while the transfer is paused', () => {
    renderSenderView({ status: 'transferring', focus: makeReceiver({ stage: 'transferring', metrics, isPaused: true }) });

    expect(screen.getByRole('button', { name: /resume/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /pause/i })).toBeNull();
  });

  it('shows why the transfer failed and returns to the link', () => {
    const actions = renderSenderView({
      state: shared(),
      status: 'failed',
      focus: makeReceiver({ stage: 'failed', error: 'Connection to peer lost' }),
    });

    expect(screen.getByText('Connection to peer lost')).toBeDefined();
    fireEvent.click(screen.getByTestId('dismiss-error'));
    expect(actions.dismissError).toHaveBeenCalledTimes(1);
  });

  it('shows a room setup error with a retry instead of generating forever', () => {
    const actions = renderSenderView({ state: { roomCode: '', roomError: 'Could not reach the signaling server' } });

    expect(screen.getByText('Could not reach the signaling server')).toBeDefined();
    expect(screen.queryByText(/generating/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(actions.retryRoom).toHaveBeenCalledTimes(1);
  });

  it('asks how to share only after the files are chosen, and shows the link only once created', () => {
    const actions = renderSenderView({ state: { files: [queuedFile] } });
    expect(screen.queryByTestId('create-link')).toBeNull();
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();

    fireEvent.click(screen.getByTestId('share-files'));
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();
    fireEvent.click(screen.getByTestId('create-link'));

    expect(actions.createLink).toHaveBeenCalledTimes(1);
  });

  it('suggests a random PIN when one is required, and never creates a link with an empty one', () => {
    const actions = renderSenderView({ state: { files: [queuedFile] } });
    fireEvent.click(screen.getByTestId('share-files'));

    fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

    expect(actions.setSharingOptions).toHaveBeenCalledWith(expect.objectContaining({ pin: expect.stringMatching(/^\d{4}$/) }));
    const pinField = screen.getByTestId('pin-input') as HTMLInputElement;
    // The field is controlled by the (stubbed) session, so it is still empty: submitting must stop there
    expect(pinField.value).toBe('');
    expect(pinField.required).toBe(true);
    fireEvent.click(screen.getByTestId('create-link'));
    expect(pinField.checkValidity()).toBe(false);
    expect(actions.createLink).not.toHaveBeenCalled();
  });

  it('lets the sender go back from the sharing options to edit the files', () => {
    renderSenderView({ state: { files: [queuedFile] } });
    fireEvent.click(screen.getByTestId('share-files'));

    fireEvent.click(screen.getByTestId('edit-files'));

    expect(screen.getByTestId('pick-files')).toBeDefined();
  });

  it('copies a link that carries the room key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSenderView({ state: shared() });

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?room=DW-ABC234#key=link-key$/));
  });

  it('shows the link is waiting for someone until they arrive', () => {
    renderSenderView({ state: shared() });

    expect(screen.getByTestId('share-waiting')).toBeDefined();
  });

  it('shows that the receiver is choosing where to save, while files can still change', () => {
    const receiver = makeReceiver();
    const actions = renderSenderView({ state: shared({ receivers: [receiver] }), status: 'awaiting_receiver', focus: receiver });

    expect(screen.getByText(/choosing where to save/i)).toBeDefined();
    expect(screen.queryByTestId('share-waiting')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(actions.cancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('edit-files'));
    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByTestId('pick-files')).toBeDefined();
  });

  it('asks for files, not approval, when a receiver opened the link early', () => {
    renderSenderView({ state: { pendingPeers: [{ peerId: 'receiver-1', isTrusted: true }] } });

    expect(screen.getByText(/opened your link/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('asks about the first person waiting for approval, and answers for that person', () => {
    const actions = renderSenderView({
      state: shared({
        pendingPeers: [
          { peerId: 'early', isTrusted: true },
          { peerId: 'typed-code', isTrusted: false },
        ],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(actions.approvePeer).toHaveBeenCalledWith('typed-code');
  });

  it('marks queued files with an icon for their type', () => {
    renderSenderView({ state: { files: [queuedFile] } });

    expect(document.querySelector('[data-file-kind="pdf"]')).not.toBeNull();
  });

  it('offers receiving by code on the landing page', () => {
    const onSwitchToReceive = vi.fn();
    renderSenderView({}, onSwitchToReceive);

    fireEvent.click(screen.getByRole('button', { name: /receive files/i }));
    expect(onSwitchToReceive).toHaveBeenCalledTimes(1);
  });

  it('stops offering to receive once files are queued', () => {
    renderSenderView({ state: { files: [queuedFile] } }, () => {});

    expect(screen.queryByRole('button', { name: /receive files/i })).toBeNull();
  });

  it('lists every file with its progress while a multi-file transfer runs', () => {
    const second: TransferFile = { ...queuedFile, id: 'f2', name: 'notes.txt', type: 'text/plain' };
    renderSenderView({
      state: { files: [queuedFile, second] },
      status: 'transferring',
      focus: makeReceiver({ stage: 'transferring', metrics }),
    });

    expect(document.querySelector('[data-status="active"]')?.textContent).toContain('report.pdf');
    expect(document.querySelector('[data-status="pending"]')?.textContent).toContain('notes.txt');
  });

  it('heads the queue with just the file count and total size', () => {
    renderSenderView({ state: { files: [queuedFile] } });

    expect(screen.getByText('1 file · 2 KB')).toBeDefined();
    expect(screen.queryByText(/ready to send/i)).toBeNull();
  });

  it('explains why the room code changed', () => {
    renderSenderView({ state: shared({ roomNotice: 'This is a new room.' }) });

    expect(screen.getByText('This is a new room.')).toBeDefined();
  });

  it('summarises only the files the receiver chose', () => {
    const second: TransferFile = { ...queuedFile, id: 'f2', name: 'notes.txt', type: 'text/plain' };
    renderSenderView({
      state: { files: [queuedFile, second] },
      status: 'completed',
      focus: makeReceiver({ stage: 'completed', fileIndices: [1] }),
    });

    expect(screen.getByText(/^1 file · /)).toBeDefined();
  });

  it('offers the same files to someone else, or other files, once the download is done', () => {
    const actions = renderSenderView({ state: shared(), status: 'completed', focus: makeReceiver({ stage: 'completed' }) });

    fireEvent.click(screen.getByTestId('send-again'));
    fireEvent.click(screen.getByTestId('send-other-files'));

    expect(actions.stopSharing).toHaveBeenCalledTimes(1);
    expect(actions.clearFiles).toHaveBeenCalledTimes(1);
  });

  it('goes straight to the sharing options when sending the same files to someone else', () => {
    const session = {
      // Last seen on the file list (e.g. after adding a file), not on the link
      state: { ...createInitialSenderState(), roomCode: 'DW-ABC234', shareKey: 'link-key', files: [queuedFile] },
      status: 'completed' as SenderStatus,
      focus: makeReceiver({ stage: 'completed' }),
      actions: makeActions(),
    } as SenderSession;
    const { rerender } = render(<SenderView session={session} />);
    fireEvent.click(screen.getByTestId('send-again'));

    rerender(<SenderView session={{ ...session, status: 'waiting', focus: null }} />);

    expect(screen.getByTestId('create-link')).toBeDefined();
  });

  describe('stopping the share', () => {
    it('stops straight away when nobody is connected', () => {
      const actions = renderSenderView({ state: shared() });

      fireEvent.click(screen.getByTestId('stop-sharing'));

      expect(actions.stopSharing).toHaveBeenCalledTimes(1);
    });

    it('asks first when it would stop someone’s download', () => {
      const actions = renderSenderView({
        state: shared({
          options: { ...createInitialSenderState().options, allowMultiple: true },
          receivers: [makeReceiver({ stage: 'transferring', metrics })],
        }),
      });

      fireEvent.click(screen.getByTestId('stop-sharing'));
      expect(actions.stopSharing).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.stopSharing).toHaveBeenCalledTimes(1);
    });
  });

  describe('sharing with several people', () => {
    const several = (receivers: SenderReceiver[]) =>
      shared({ options: { ...createInitialSenderState().options, allowMultiple: true, maxSimultaneous: 2 }, receivers });

    it('lists everyone with where they are, keeping the link on screen', () => {
      renderSenderView({
        state: several([
          makeReceiver({ peerId: 'a', number: 1, stage: 'transferring', metrics }),
          makeReceiver({ peerId: 'b', number: 2, stage: 'choosing' }),
          makeReceiver({ peerId: 'c', number: 3, stage: 'queued' }),
          makeReceiver({ peerId: 'd', number: 4, stage: 'queued' }),
        ]),
      });

      const rows = screen.getAllByTestId('receiver-row');
      expect(rows.map((row) => row.dataset.stage)).toEqual(['transferring', 'choosing', 'queued', 'queued']);
      expect(within(rows[0]).getByText(/50%/)).toBeDefined();
      expect(within(rows[2]).getByText(/next in line/i)).toBeDefined();
      expect(within(rows[3]).getByText(/#2/)).toBeDefined();
      expect(screen.getByRole('button', { name: /copy link/i })).toBeDefined();
    });

    it('stops one person after confirming', () => {
      const actions = renderSenderView({ state: several([makeReceiver({ peerId: 'a', stage: 'transferring', metrics })]) });

      fireEvent.click(screen.getByTitle('Stop Person 1'));
      expect(actions.stopReceiver).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.stopReceiver).toHaveBeenCalledWith('a');
    });

    it('removes finished people from the list without asking', () => {
      const actions = renderSenderView({ state: several([makeReceiver({ peerId: 'a', stage: 'completed' })]) });

      fireEvent.click(screen.getByTitle('Remove from list'));

      expect(actions.dismissReceiver).toHaveBeenCalledWith('a');
    });

    it('asks whether a lower download limit should stop everyone now', () => {
      const actions = renderSenderView({
        state: several([makeReceiver({ peerId: 'a', stage: 'transferring' }), makeReceiver({ peerId: 'b', stage: 'transferring' })]),
      });
      fireEvent.click(screen.getByTestId('edit-sharing'));

      fireEvent.click(screen.getByTitle('Fewer'));
      fireEvent.click(screen.getByTestId('save-sharing'));
      fireEvent.click(screen.getByTestId('apply-to-new'));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ maxSimultaneous: 1 }), 'new');
    });
  });

  describe('changing how files are shared after the link is out', () => {
    function editSharing(overrides: SessionOverrides = {}) {
      const receiver = makeReceiver();
      const actions = renderSenderView({
        state: shared({ receivers: [receiver] }),
        status: 'awaiting_receiver',
        focus: receiver,
        ...overrides,
      });
      fireEvent.click(screen.getByTestId('edit-sharing'));
      return actions;
    }

    it('asks whether a stricter setting should also stop the current receiver', () => {
      const actions = editSharing();

      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));
      fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '1234' } });
      fireEvent.click(screen.getByTestId('save-sharing'));
      expect(actions.updateSharing).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('apply-to-new'));
      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: '1234' }), 'new');
    });

    it('can apply a stricter setting to the current receiver too', () => {
      const actions = editSharing();

      fireEvent.click(screen.getByRole('checkbox', { name: /ask me before anyone connects/i }));
      fireEvent.click(screen.getByTestId('save-sharing'));
      fireEvent.click(screen.getByTestId('apply-now'));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ requireApproval: true }), 'now');
    });

    it('saves without asking when the change only loosens things', () => {
      const receiver = makeReceiver();
      const actions = editSharing({
        state: shared({ receivers: [receiver], options: { ...createInitialSenderState().options, pin: '1234' } }),
      });

      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));
      fireEvent.click(screen.getByTestId('save-sharing'));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: '' }), 'new');
      expect(screen.queryByTestId('apply-now')).toBeNull();
    });
  });

  describe('editing files after sharing', () => {
    it('warns before removing a file from what a connected receiver is choosing from', () => {
      const receiver = makeReceiver();
      const actions = renderSenderView({ state: shared({ receivers: [receiver] }), status: 'awaiting_receiver', focus: receiver });
      fireEvent.click(screen.getByTestId('edit-files'));

      fireEvent.click(screen.getByTitle('Remove report.pdf'));
      expect(actions.removeFile).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.removeFile).toHaveBeenCalledWith('f1');
    });

    it('warns that clearing everything after sharing replaces the link', () => {
      const actions = renderSenderView({ state: shared() });
      fireEvent.click(screen.getByTestId('edit-files'));

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
      expect(actions.clearFiles).not.toHaveBeenCalled();
      expect(screen.getByText(/link stops working/i)).toBeDefined();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.clearFiles).toHaveBeenCalledTimes(1);
    });

    it('shows the PIN in the sharing summary so it can be passed on', () => {
      renderSenderView({ state: shared({ options: { ...createInitialSenderState().options, pin: '2468' } }) });

      expect(screen.getByText(/PIN 2468/)).toBeDefined();
    });

    it('removes straight away when nobody is choosing, noting the link shows the change', () => {
      const actions = renderSenderView({ state: shared() });
      fireEvent.click(screen.getByTestId('edit-files'));

      expect(screen.getByText(/link is live/i)).toBeDefined();
      fireEvent.click(screen.getByTitle('Remove report.pdf'));

      expect(actions.removeFile).toHaveBeenCalledWith('f1');
    });
  });
});
