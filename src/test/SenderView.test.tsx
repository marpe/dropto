import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SenderView } from '../components/SenderView';
import type { SenderSession, SenderSessionState } from '../hooks/useSenderSession';
import { createInitialSenderState } from '../hooks/senderState';
import { DEFAULT_SIMULTANEOUS } from '../utils/sharingLimits';
import type { SenderReceiver } from '../types/sharing';
import type { SenderStatus, TransferFile, TransferMetrics } from '../types/transfer';

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
  const stage = overrides.stage ?? 'choosing';
  return {
    peerId: 'receiver-1',
    details: noDetails,
    stage,
    // Connected without downloading (choosing, or after a download) counts as idle
    idleSinceMs: stage === 'choosing' || stage === 'completed' ? Date.now() : null,
    hasLeft: false,
    downloadFiles: [],
    sentFiles: [],
    finishedFiles: {},
    metrics: null,
    isPaused: false,
    error: null,
    ...overrides,
  };
}

function makeActions(overrides: Partial<SenderSession['actions']> = {}): SenderSession['actions'] {
  return {
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
    ...overrides,
  };
}

interface SessionOverrides {
  state?: Partial<SenderSessionState>;
  status?: SenderStatus;
  focus?: SenderReceiver | null;
  actions?: Partial<SenderSession['actions']>;
  restorableCount?: number;
}

function renderSenderView(
  { state = {}, status = 'waiting', focus = null, actions = {}, restorableCount = 0 }: SessionOverrides = {},
  onSwitchToReceive?: () => void
) {
  const session = {
    state: { ...createInitialSenderState(), roomCode: 'DW-ABC234', shareKey: 'link-key', ...state },
    status,
    focus,
    restorableCount,
    actions: makeActions(actions),
  } as SenderSession;
  render(<SenderView session={session} onSwitchToReceive={onSwitchToReceive} />);
  return session.actions;
}

const openSettings = () => fireEvent.click(screen.getByTestId('open-link-settings'));

const shared = (state: Partial<SenderSessionState> = {}) => ({ files: [queuedFile], isShared: true, ...state });

describe('SenderView', () => {
  it('offers Resume on the row of someone whose download is paused', () => {
    const actions = renderSenderView({
      state: shared({ receivers: [makeReceiver({ stage: 'transferring', metrics, isPaused: true })] }),
      status: 'transferring',
    });

    const row = screen.getByTestId('receiver-row');
    fireEvent.click(within(row).getByTitle('Resume'));
    expect(within(row).queryByTitle('Pause')).toBeNull();
    expect(actions.togglePauseReceiver).toHaveBeenCalledWith('receiver-1');
  });

  it('shows a failed download on the person’s row, keeping the link on screen', () => {
    const actions = renderSenderView({
      state: shared({ receivers: [makeReceiver({ stage: 'failed', error: 'Connection to peer lost' })] }),
      status: 'failed',
    });

    expect(within(screen.getByTestId('receiver-row')).getByText('Connection to peer lost')).toBeDefined();
    expect(screen.getByTestId('link-bar')).toBeDefined();
    fireEvent.click(screen.getByTitle('Remove from list'));
    expect(actions.dismissReceiver).toHaveBeenCalledWith('receiver-1');
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
    it('raises the number of simultaneous downloads from the default', () => {
      const actions = renderSenderView({ state: shared() });
      openSettings();
      expect(screen.getByRole('status', { name: /simultaneous downloads/i }).textContent).toBe(String(DEFAULT_SIMULTANEOUS));

      fireEvent.click(screen.getByTitle('More'));

      expect(actions.updateSharing).toHaveBeenCalledWith(
        expect.objectContaining({ maxSimultaneous: DEFAULT_SIMULTANEOUS + 1 }),
        'new'
      );
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

  it('puts the link where the Share button was, with Copy and a menu of the other tools joined to it', () => {
    renderSenderView({ state: shared() });

    expect(screen.getByTestId('link-bar').closest('[data-testid="file-queue"]')).toBeNull();
    expect(screen.getByTitle('Copy link')).toBeDefined();
    expect(screen.getByTitle('Link options')).toBeDefined();
    const items = screen.getAllByRole('menuitem', { hidden: true }).map((item) => item.textContent);
    expect(items).toEqual(['Link settings', 'QR code and room code', 'Stop sharing']);
  });

  it('shows a receiver who has not started downloading as connected, while files can still change', () => {
    const receiver = makeReceiver();
    const actions = renderSenderView({ state: shared({ receivers: [receiver] }), status: 'awaiting_receiver', focus: receiver });

    // One person or several, whoever is connected is listed under the link
    const row = screen.getByTestId('receiver-row');
    expect(within(row).getByText(/idle for [0-9]+ s/i)).toBeDefined();
    fireEvent.click(within(row).getByTitle('Disconnect'));
    fireEvent.click(screen.getByTestId('confirm'));
    expect(actions.stopReceiver).toHaveBeenCalledWith('receiver-1');

    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByTestId('pick-files')).toBeDefined();
  });

  it('lists someone who opened the link early as waiting for files, with nothing to accept', () => {
    renderSenderView({ state: { pendingPeers: [{ peerId: 'receiver-1', isTrusted: true, details: noDetails }] } });

    expect(within(screen.getByTestId('pending-peer')).getByText(/waiting for files/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('shows someone asking to connect straight away, even on the empty page after a reload', () => {
    renderSenderView({ state: { pendingPeers: [{ peerId: 'p', isTrusted: false, details: noDetails }] } });

    expect(within(screen.getByTestId('pending-peer')).getByRole('img', { name: 'Waiting' })).toBeDefined();
    // No files yet is fine: they wait on an empty list until some are added
    expect((screen.getByTestId('approve-peer') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says someone with the link joins once the files are shared', () => {
    renderSenderView({ state: { files: [queuedFile], pendingPeers: [{ peerId: 'p', isTrusted: true, details: noDetails }] } });

    expect(within(screen.getByTestId('pending-peer')).getByText(/joins when you share/i)).toBeDefined();
  });

  it('lists people asking to connect with Accept and Decline, answering for that person', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    expect(actions.rejectPeer).toHaveBeenCalledWith('typed-code');
  });

  it('says which device is asking to connect', () => {
    renderSenderView({
      state: shared({
        pendingPeers: [
          { peerId: 'p', isTrusted: false, details: { device: 'Firefox on Linux', timeZone: 'Europe/Oslo', ip: '198.51.100.4' } },
        ],
      }),
    });

    expect(screen.getByRole('img', { name: 'Firefox' })).toBeDefined();
    expect(screen.getByText('Firefox on Linux')).toBeDefined();
    expect(screen.getByText('198.51.100.4 · Time zone: Oslo')).toBeDefined();
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

  it('stays on the file list while someone downloads, showing their progress on their row', () => {
    const second: TransferFile = { ...queuedFile, id: 'f2', name: 'notes.txt', type: 'text/plain' };
    const downloading = makeReceiver({ stage: 'transferring', metrics });
    renderSenderView({
      state: shared({ files: [queuedFile, second], receivers: [downloading] }),
      status: 'transferring',
      focus: downloading,
    });

    expect(screen.getByTestId('file-queue')).toBeDefined();
    expect(within(screen.getByTestId('receiver-row')).getByText(/50%/)).toBeDefined();
  });

  it('shows the file count and total size under the list', () => {
    renderSenderView({ state: { files: [queuedFile] } });

    expect(screen.getByTestId('file-totals').textContent).toMatch(/^1 file\s*·\s*2 KB$/);
  });

  describe('ticking files to remove', () => {
    const second: TransferFile = { ...queuedFile, id: 'f2', name: 'notes.txt', rawFile: new File(['y'], 'notes.txt') };

    it('removes the ticked files together, and goes back to the totals afterwards', () => {
      const actions = renderSenderView({ state: { files: [queuedFile, second] } });

      fireEvent.click(screen.getByRole('checkbox', { name: /report.pdf/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /notes.txt/ }));
      expect(screen.getByTestId('ticked-count').textContent).toBe('2 selected');
      fireEvent.click(screen.getByTestId('remove-ticked'));

      expect(actions.removeFiles).toHaveBeenCalledWith(['f1', 'f2']);
      expect(screen.getByTestId('file-totals')).toBeDefined();
    });

    it('asks first when someone may be choosing from those files', () => {
      const actions = renderSenderView({ state: shared({ files: [queuedFile, second], receivers: [makeReceiver()] }) });

      fireEvent.click(screen.getByRole('checkbox', { name: /report.pdf/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /notes.txt/ }));
      fireEvent.click(screen.getByTestId('remove-ticked'));

      expect(screen.getByRole('heading', { name: 'Remove 2 files?' })).toBeDefined();
      expect(actions.removeFiles).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));
      expect(actions.removeFiles).toHaveBeenCalledWith(['f1', 'f2']);
    });

    it('offers no ticking with a single file', () => {
      renderSenderView({ state: { files: [queuedFile] } });

      expect(screen.queryByRole('checkbox', { name: /report.pdf/ })).toBeNull();
    });
  });

  it('lists files from before a reload faded, asking for them again, and drops one without asking', () => {
    const missing = { id: 'm1', name: 'holiday.jpg', size: 4096, type: 'image/jpeg', lastModified: 1 };
    const actions = renderSenderView({ state: { missingFiles: [missing] } });

    expect(screen.getByText(/1 file needs adding again/i)).toBeDefined();
    const row = screen.getByTestId('file-row');
    expect(row.hasAttribute('data-missing')).toBe(true);
    expect(screen.getByTestId('file-totals').textContent).toMatch(/^0 of 1 file/);

    fireEvent.click(within(row).getByTitle('Remove holiday.jpg'));

    expect(actions.removeFiles).toHaveBeenCalledWith(['m1']);
    expect(screen.queryByTestId('confirm')).toBeNull();
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

  it('lists under each person the files sent to them, with how each went', () => {
    const sent = { id: 'a', name: 'sent.txt', size: 10, type: 'text/plain' };
    const bad = { id: 'b', name: 'bad.txt', size: 10, type: 'text/plain' };
    renderSenderView({
      state: shared({
        receivers: [
          makeReceiver({
            stage: 'completed',
            downloadFiles: [sent, bad],
            sentFiles: [sent, bad],
            finishedFiles: { a: { seconds: 1, isCorrupted: false }, b: { seconds: 1, isCorrupted: true } },
          }),
        ],
      }),
    });

    const row = screen.getByTestId('receiver-row');
    expect(within(row).getAllByTestId('file-row').map((file) => file.dataset.status)).toEqual(['done', 'corrupted']);
    expect(row.textContent).not.toMatch(/done/i);
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
          options: createInitialSenderState().options,
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
      shared({ options: { ...createInitialSenderState().options, maxSimultaneous: 2 }, receivers });

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
      expect(within(row).getByRole('img', { name: 'Chrome' })).toBeDefined();
      expect(within(row).getByText('Chrome on Android')).toBeDefined();
      expect(within(row).getByText('203.0.113.7 · Time zone: Stockholm')).toBeDefined();
    });

    it('removes people who left from the list without asking', () => {
      const actions = renderSenderView({
        state: several([makeReceiver({ peerId: 'a', stage: 'completed', idleSinceMs: null, hasLeft: true })]),
      });
      expect(within(screen.getByTestId('receiver-row')).getByRole('img', { name: 'Left' })).toBeDefined();

      fireEvent.click(screen.getByTitle('Remove from list'));

      expect(actions.dismissReceiver).toHaveBeenCalledWith('a');
    });

    it('asks whether a lower download limit should stop everyone now', () => {
      const actions = renderSenderView({
        state: several([makeReceiver({ peerId: 'a', stage: 'transferring' }), makeReceiver({ peerId: 'b', stage: 'transferring' })]),
      });
      openSettings();
      fireEvent.click(screen.getByTitle('Fewer'));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ maxSimultaneous: 1 }), 'new');
      expect(screen.getByRole('heading', { name: 'Stop current downloads?' })).toBeDefined();
      expect(screen.getByText(/2 people are still connected/i)).toBeDefined();
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

    it('applies a stricter setting to new connections, then asks whether to stop the current download', () => {
      const actions = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: expect.stringMatching(/^\d{4}$/) }), 'new');
      expect(screen.getByRole('heading', { name: 'Stop current downloads?' })).toBeDefined();
      expect(screen.getByText(/new connections need a pin\. someone is still connected/i)).toBeDefined();
    });

    it('stops the current download too when asked', () => {
      const actions = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.updateSharing).toHaveBeenLastCalledWith(expect.objectContaining({ requireApproval: true }), 'now');
    });

    it('lets the current download go on when the question is dismissed', () => {
      const actions = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(actions.updateSharing).toHaveBeenCalledTimes(1);
      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ requireApproval: true }), 'new');
      expect(screen.queryByRole('heading', { name: 'Stop current downloads?' })).toBeNull();
    });

    it('applies without asking when the change only loosens things', () => {
      const receiver = makeReceiver();
      const actions = renderWithSomeoneConnected({
        state: shared({ receivers: [receiver], options: { ...createInitialSenderState().options, pin: '1234' } }),
      });

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

      expect(actions.updateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: '' }), 'new');
      expect(screen.queryByTestId('confirm')).toBeNull();
    });
  });

  describe('editing files after sharing', () => {
    it('warns before removing a file from what a connected receiver is choosing from', () => {
      const receiver = makeReceiver();
      const actions = renderSenderView({ state: shared({ receivers: [receiver] }), status: 'awaiting_receiver', focus: receiver });

      fireEvent.click(screen.getByTitle('Remove report.pdf'));
      expect(actions.removeFiles).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(actions.removeFiles).toHaveBeenCalledWith(['f1']);
    });

    it('warns that clearing everything after sharing replaces the link', () => {
      const actions = renderSenderView({ state: shared() });

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
      expect(actions.clearFiles).not.toHaveBeenCalled();
      expect(screen.getByText(/link stops working/i)).toBeDefined();
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

      expect(actions.removeFiles).toHaveBeenCalledWith(['f1']);
    });
  });
});
