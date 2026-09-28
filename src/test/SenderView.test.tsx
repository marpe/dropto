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
  fileSeconds: [],
};

const noDetails = { device: null, timeZone: null, ip: null };

function makeReceiver(overrides: Partial<SenderReceiver> = {}): SenderReceiver {
  return {
    peerId: 'receiver-1',
    details: noDetails,
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

const openSettings = () => fireEvent.click(screen.getByTestId('open-link-settings'));

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

  it('creates the link straight away with Share, without copying anything', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const actions = renderSenderView({ state: { files: [queuedFile] } });
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();

    fireEvent.click(screen.getByTestId('share-files'));

    expect(actions.createLink).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('shows the link and its settings below the files once shared, with no separate step', () => {
    renderSenderView({ state: shared() });

    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeDefined();
    expect(screen.getByTestId('open-link-settings')).toBeDefined();
    expect(screen.queryByTestId('share-files')).toBeNull();
  });

  it('lists each file with its size and, where there is room, when it was last modified', () => {
    renderSenderView({ state: { files: [{ ...queuedFile, lastModified: new Date(2024, 2, 12).getTime() }] } });

    const row = screen.getByTestId('file-row');
    expect(within(row).getByText('2 KB')).toBeDefined();
    expect(within(row).getByTestId('file-modified').textContent).toMatch(/2024/);
  });

  describe('sharing settings', () => {
    it('turns on simultaneous downloads by raising the number above one', () => {
      const actions = renderSenderView({ state: shared() });
      openSettings();
      expect(screen.getByRole('status', { name: /simultaneous downloads/i }).textContent).toBe('1');

      fireEvent.click(screen.getByTitle('More'));

      expect(actions.updateSharing).toHaveBeenCalledWith(
        expect.objectContaining({ allowMultiple: true, maxSimultaneous: 2 }),
        'new'
      );
    });

    it('shows the download limit when several people may download', () => {
      renderSenderView({ state: shared({ options: { ...createInitialSenderState().options, allowMultiple: true, maxSimultaneous: 4 } }) });

      openSettings();
      expect(screen.getByRole('status', { name: /simultaneous downloads/i }).textContent).toBe('4');
    });

    const withPin = (pin: string) => shared({ options: { ...createInitialSenderState().options, pin } });

    it('suggests a random PIN as soon as one is required', () => {
      const actions = renderSenderView({ state: shared() });

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: expect.stringMatching(/^\d{4}$/) }), 'new');
    });

    it('applies a typed PIN when the field is left or Enter is pressed, not on every keystroke', () => {
      const actions = renderSenderView({ state: withPin('1234') });
      openSettings();
      const pinField = screen.getByTestId('pin-input');

      fireEvent.change(pinField, { target: { value: '56' } });
      expect(actions.updateSharing).not.toHaveBeenCalled();
      fireEvent.change(pinField, { target: { value: '5678' } });
      fireEvent.keyDown(pinField, { key: 'Enter' });

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: '5678' }), 'new');
    });

    it('keeps the current PIN when the field is left empty', () => {
      const actions = renderSenderView({ state: withPin('1234') });
      openSettings();
      const pinField = screen.getByTestId('pin-input') as HTMLInputElement;

      fireEvent.change(pinField, { target: { value: '' } });
      fireEvent.blur(pinField);

      expect(actions.updateSharing).not.toHaveBeenCalled();
      expect(pinField.value).toBe('1234');
    });
  });

  it('copies a link that carries the room key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderSenderView({ state: shared() });

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?room=DW-ABC234#key=link-key$/));
  });

  it('shows nothing below the link until someone connects', () => {
    renderSenderView({ state: shared() });

    expect(screen.queryAllByTestId('receiver-row')).toHaveLength(0);
  });

  it('puts the link where the Share button was, outside the files card, with its tools as icons', () => {
    renderSenderView({ state: shared() });

    expect(screen.getByTestId('link-bar').closest('[data-testid="file-queue"]')).toBeNull();
    for (const tool of ['Copy link', 'Link settings', 'Show QR code and room code', 'Stop sharing']) {
      expect(screen.getByTitle(tool)).toBeDefined();
    }
  });

  it('shows that the receiver is choosing where to save, while files can still change', () => {
    const receiver = makeReceiver();
    const actions = renderSenderView({ state: shared({ receivers: [receiver] }), status: 'awaiting_receiver', focus: receiver });

    // One person or several, whoever is connected is listed under the link
    const row = screen.getByTestId('receiver-row');
    expect(within(row).getByText(/choosing where to save/i)).toBeDefined();
    fireEvent.click(within(row).getByTitle('Stop download'));
    fireEvent.click(screen.getByTestId('confirm'));
    expect(actions.stopReceiver).toHaveBeenCalledWith('receiver-1');

    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByTestId('pick-files')).toBeDefined();
  });

  it('asks for files, not approval, when a receiver opened the link early', () => {
    renderSenderView({ state: { pendingPeers: [{ peerId: 'receiver-1', isTrusted: true, details: noDetails }] } });

    expect(screen.getByText(/opened your link/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('asks about the first person waiting for approval, and answers for that person', () => {
    const actions = renderSenderView({
      state: shared({
        pendingPeers: [
          { peerId: 'early', isTrusted: true, details: noDetails },
          { peerId: 'typed-code', isTrusted: false, details: noDetails },
        ],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(actions.approvePeer).toHaveBeenCalledWith('typed-code');
  });

  it('says which device is asking to connect', () => {
    renderSenderView({
      state: shared({
        pendingPeers: [
          { peerId: 'p', isTrusted: false, details: { device: 'Firefox on Linux', timeZone: 'Europe/Oslo', ip: '198.51.100.4' } },
        ],
      }),
    });

    expect(screen.getByText('Firefox on Linux')).toBeDefined();
    expect(screen.getByText('198.51.100.4')).toBeDefined();
    expect(screen.getByText('Oslo')).toBeDefined();
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

  it('shows the file count and total size under the list', () => {
    renderSenderView({ state: { files: [queuedFile] } });

    expect(screen.getByText('1 file · 2 KB')).toBeDefined();
  });

  it('sorts the files by the column clicked, then the other way, then back to the order they were added', () => {
    const small: TransferFile = { ...queuedFile, id: 's', name: 'zebra.txt', size: 10, lastModified: 3 };
    const large: TransferFile = { ...queuedFile, id: 'l', name: 'apple.txt', size: 5000, lastModified: 1 };
    renderSenderView({ state: { files: [small, large] } });
    const names = () => screen.getAllByTestId('file-row').map((row) => row.textContent?.match(/[a-z]+[.]txt/)?.[0]);

    fireEvent.click(screen.getByRole('button', { name: /^name/i }));
    expect(names()).toEqual(['apple.txt', 'zebra.txt']);
    fireEvent.click(screen.getByRole('button', { name: /^name/i }));
    expect(names()).toEqual(['zebra.txt', 'apple.txt']);
    fireEvent.click(screen.getByRole('button', { name: /^name/i }));
    expect(names()).toEqual(['zebra.txt', 'apple.txt']);

    fireEvent.click(screen.getByRole('button', { name: /^size/i }));
    expect(names()).toEqual(['zebra.txt', 'apple.txt']);
    fireEvent.click(screen.getByRole('button', { name: /^modified/i }));
    expect(names()).toEqual(['apple.txt', 'zebra.txt']);
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

    expect(screen.getByTestId('stat-files').textContent).toMatch(/1$/);
  });

  it('offers the same files to someone else, or other files, once the download is done', () => {
    const actions = renderSenderView({ state: shared(), status: 'completed', focus: makeReceiver({ stage: 'completed' }) });

    fireEvent.click(screen.getByTestId('send-again'));
    fireEvent.click(screen.getByTestId('send-other-files'));

    expect(actions.stopSharing).toHaveBeenCalledTimes(1);
    expect(actions.clearFiles).toHaveBeenCalledTimes(1);
  });

  it('offers Share again for the same files after sending them to someone', () => {
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

    expect(screen.getByTestId('share-files')).toBeDefined();
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
          makeReceiver({ peerId: 'a', stage: 'transferring', metrics }),
          makeReceiver({ peerId: 'b', stage: 'choosing' }),
          makeReceiver({ peerId: 'c', stage: 'queued' }),
          makeReceiver({ peerId: 'd', stage: 'queued' }),
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

      fireEvent.click(screen.getByTitle('Stop download'));
      expect(actions.stopReceiver).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.stopReceiver).toHaveBeenCalledWith('a');
    });

    it('names people by their device, with their address and place', () => {
      renderSenderView({
        state: several([
          makeReceiver({
            peerId: 'a',
            stage: 'transferring',
            metrics,
            details: { device: 'Chrome on Android', timeZone: 'Europe/Stockholm', ip: '203.0.113.7' },
          }),
        ]),
      });

      const row = screen.getByTestId('receiver-row');
      expect(within(row).getByText('Chrome on Android')).toBeDefined();
      expect(within(row).getByText('203.0.113.7 · Stockholm')).toBeDefined();
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
      openSettings();
      fireEvent.click(screen.getByTitle('Fewer'));
      expect(actions.updateSharing).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('apply-to-new'));

      // Down to one is the one-person link again
      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ allowMultiple: false }), 'new');
    });
  });

  describe('changing how files are shared after the link is out', () => {
    function renderWithSomeoneConnected(overrides: SessionOverrides = {}) {
      const receiver = makeReceiver();
      return renderSenderView({ state: shared({ receivers: [receiver] }), status: 'awaiting_receiver', focus: receiver, ...overrides });
    }

    it('applies a change at once when nobody is connected', () => {
      const actions = renderSenderView({ state: shared() });

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ requireApproval: true }), 'new');
    });

    it('asks whether a stricter setting should also stop the current receiver', () => {
      const actions = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));
      expect(actions.updateSharing).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('apply-to-new'));
      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: expect.stringMatching(/^\d{4}$/) }), 'new');
    });

    it('can apply a stricter setting to the current receiver too', () => {
      const actions = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));
      fireEvent.click(screen.getByTestId('apply-now'));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ requireApproval: true }), 'now');
    });

    it('leaves the settings as they were when the question is dismissed', () => {
      const actions = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

      expect(actions.updateSharing).not.toHaveBeenCalled();
      expect((screen.getByRole('checkbox', { name: /require connection approval/i }) as HTMLInputElement).checked).toBe(false);
    });

    it('applies without asking when the change only loosens things', () => {
      const receiver = makeReceiver();
      const actions = renderWithSomeoneConnected({
        state: shared({ receivers: [receiver], options: { ...createInitialSenderState().options, pin: '1234' } }),
      });

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: '' }), 'new');
      expect(screen.queryByTestId('apply-now')).toBeNull();
    });
  });

  describe('editing files after sharing', () => {
    it('warns before removing a file from what a connected receiver is choosing from', () => {
      const receiver = makeReceiver();
      const actions = renderSenderView({ state: shared({ receivers: [receiver] }), status: 'awaiting_receiver', focus: receiver });

      fireEvent.click(screen.getByTitle('Remove report.pdf'));
      expect(actions.removeFile).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.removeFile).toHaveBeenCalledWith('f1');
    });

    it('warns that clearing everything after sharing replaces the link', () => {
      const actions = renderSenderView({ state: shared() });

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
      expect(actions.clearFiles).not.toHaveBeenCalled();
      expect(screen.getByText(/current link stops working/i)).toBeDefined();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.clearFiles).toHaveBeenCalledTimes(1);
    });

    it('shows the PIN in the settings so it can be passed on', () => {
      renderSenderView({ state: shared({ options: { ...createInitialSenderState().options, pin: '2468' } }) });
      openSettings();

      expect((screen.getByTestId('pin-input') as HTMLInputElement).value).toBe('2468');
    });

    it('removes straight away when nobody is choosing', () => {
      const actions = renderSenderView({ state: shared() });

      fireEvent.click(screen.getByTitle('Remove report.pdf'));

      expect(actions.removeFile).toHaveBeenCalledWith('f1');
    });
  });
});
