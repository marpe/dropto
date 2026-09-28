import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiverView } from '../components/ReceiverView';
import type { ReceiverSession } from '../hooks/useReceiverSession';
import { initialReceiverState } from '../hooks/receiverState';
import type { ReceiverSessionState } from '../hooks/receiverState';
import type { ReceiverStatus, TransferManifest, TransferMetrics } from '../types/transfer';

// canvas-confetti needs a real canvas; a finished download would otherwise throw after the test ends
vi.mock('../services/confetti', () => ({
  fireCelebration: vi.fn(),
}));

type Actions = ReceiverSession['actions'];

function makeSession(state: Partial<ReceiverSessionState> = {}, actions: Partial<Actions> = {}): ReceiverSession {
  return {
    state: { ...initialReceiverState, roomCode: 'DW-123456', ...state },
    actions: {
      setRoomCode: vi.fn(),
      setPin: vi.fn(),
      connect: vi.fn(),
      retryNow: vi.fn(),
      submitPin: vi.fn(),
      startSaving: vi.fn(),
      togglePause: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
      ...actions,
    } as Actions,
  };
}

function renderReceiver(status: ReceiverStatus, state: Partial<ReceiverSessionState> = {}, actions: Partial<Actions> = {}) {
  const session = makeSession({ status, ...state }, actions);
  const view = render(<ReceiverView session={session} />);
  return { ...view, actions: session.actions };
}

describe('ReceiverView Component UI & Interaction', () => {
  const dummyManifest: TransferManifest = {
    totalBytes: 1048576,
    files: [
      {
        id: 'f1',
        name: 'archive.zip',
        size: 1048576,
        type: 'application/zip',
      },
    ],
  };

  const dummyMetrics: TransferMetrics = {
    currentSpeed: 1048576 * 15,
    averageSpeed: 1048576 * 14,
    elapsedSeconds: 1,
    etaSeconds: 5,
    bytesTransferred: 524288,
    totalBytes: 1048576,
    overallPercent: 50,
    currentFileIndex: 0,
    totalFiles: 1,
    currentFileName: 'archive.zip',
    currentFilePercent: 50,
    fileSeconds: [],
  };

  afterEach(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('renders room code input initially and connects', () => {
    const { actions } = renderReceiver('idle');

    fireEvent.click(screen.getByTestId('connect'));
    expect(actions.connect).toHaveBeenCalledTimes(1);
  });

  it('starts saving and shows feedback while the save dialog is open', async () => {
    let resolveSave: () => void = () => {};
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const startSaving = vi.fn().mockImplementation(() => savePromise);
    renderReceiver('connected', { manifest: dummyManifest }, { startSaving });

    const saveButton = screen.getByTestId('start-download') as HTMLButtonElement;
    fireEvent.click(saveButton);
    expect(startSaving).toHaveBeenCalledTimes(1);
    expect(saveButton.disabled).toBe(true);

    resolveSave();
    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });
  });

  it('shows that the sender is being asked to accept, with a way to cancel', () => {
    const { actions } = renderReceiver('waiting_approval');

    expect(screen.getByRole('heading', { name: /waiting for the sender to accept/i })).toBeDefined();
    expect(screen.getByText('DW-123456')).toBeDefined();
    expect(screen.queryByPlaceholderText(/XXXXXX/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.cancel).toHaveBeenCalledTimes(1);
  });

  it('shows that a submitted PIN is being checked', () => {
    renderReceiver('verifying_pin');

    expect(screen.getByRole('heading', { name: /checking the pin/i })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /waiting for the sender to accept/i })).toBeNull();
  });

  it('warns that files are held in memory when the browser cannot stream to disk', () => {
    renderReceiver('connected', { manifest: dummyManifest });

    expect(screen.getByTestId('storage-note')).toBeDefined();
  });

  it('shows no storage note when the browser streams to disk', () => {
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn();
    renderReceiver('connected', { manifest: dummyManifest });

    expect(screen.queryByTestId('storage-note')).toBeNull();
  });

  function renderPinStep(overrides: { pin?: string; isIncorrect?: boolean; attemptsLeft?: number } = {}) {
    return renderReceiver('pin_required', {
      pin: overrides.pin ?? '1234',
      pinPrompt: { attemptsLeft: overrides.attemptsLeft ?? 3, isIncorrect: overrides.isIncorrect ?? false },
    });
  }

  it('asks for the session PIN and submits it', () => {
    const { actions } = renderPinStep();

    fireEvent.change(screen.getByPlaceholderText(/pin/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }));

    expect(actions.setPin).toHaveBeenCalledWith('12345');
    expect(actions.submitPin).toHaveBeenCalledTimes(1);
  });

  it('shows the remaining attempts after a wrong PIN', () => {
    renderPinStep({ pin: '', isIncorrect: true, attemptsLeft: 2 });

    expect(screen.getByText(/incorrect pin/i).textContent).toMatch(/2 attempts left/i);
  });

  it('shows the download in the same file list, with progress on each file', () => {
    const { actions } = renderReceiver('transferring', { manifest: dummyManifest, metrics: dummyMetrics });

    expect(screen.getByTestId('incoming-files')).toBeDefined();
    expect(document.querySelector('[data-status="active"]')?.textContent).toContain('archive.zip');
    expect(screen.getByTestId('overall-percent').textContent).toBe('50%');
    expect(screen.queryByTestId('start-download')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(actions.togglePause).toHaveBeenCalledTimes(1);
  });

  it('asks before stopping a download', () => {
    const { actions } = renderReceiver('transferring', { manifest: dummyManifest, metrics: dummyMetrics });

    fireEvent.click(screen.getByTestId('stop-download'));
    expect(actions.cancel).not.toHaveBeenCalled();
    expect(screen.getByText('Stop download?')).toBeDefined();
    fireEvent.click(screen.getByTestId('confirm'));

    expect(actions.cancel).toHaveBeenCalledTimes(1);
  });

  it('offers to download again after finishing, keeping the list', () => {
    const { actions } = renderReceiver('completed', {
      manifest: dummyManifest,
      finishedFiles: { f1: { seconds: 2, isCorrupted: false } },
    });

    expect(document.querySelector('[data-status="done"]')?.textContent).toContain('archive.zip');
    const again = screen.getByTestId('start-download');
    expect(again.textContent).toBe('Download');
    fireEvent.click(again);
    expect(actions.startSaving).toHaveBeenCalledTimes(1);
  });

  it('says the sender left instead of offering another download, with a way out', () => {
    const { actions } = renderReceiver('completed', {
      manifest: dummyManifest,
      finishedFiles: { f1: { seconds: 2, isCorrupted: false } },
      hasSenderLeft: true,
    });

    expect(screen.queryByTestId('start-download')).toBeNull();
    expect(screen.getByText(/sender disconnected/i)).toBeDefined();
    fireEvent.click(screen.getByTestId('done'));
    expect(actions.reset).toHaveBeenCalledTimes(1);
  });

  it('waits for the files, not for approval, after opening the sender link', () => {
    renderReceiver('waiting_approval', { isInvited: true });

    expect(screen.getByRole('heading', { name: /waiting for the sender.s files/i })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /waiting for the sender to accept/i })).toBeNull();
  });

  it('keeps waiting while the sender has not queued any files yet', () => {
    renderReceiver('connected', { isInvited: true, manifest: { totalBytes: 0, files: [] } });

    expect(screen.getByRole('heading', { name: /waiting for the sender.s files/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /start download/i })).toBeNull();
  });

  it('marks offered files with an icon for their type', () => {
    renderReceiver('connected', { manifest: dummyManifest });

    expect(document.querySelector('[data-file-kind="archive"]')).not.toBeNull();
  });

  it('connects when Enter is pressed in the room code field', () => {
    const { actions } = renderReceiver('idle');

    fireEvent.submit(screen.getByPlaceholderText(/XXXXXX/));

    expect(actions.connect).toHaveBeenCalledTimes(1);
  });

  it('shows why receiving failed on its own screen, offering to try again', () => {
    const { actions } = renderReceiver('error', { error: 'This link only worked once.' });

    expect(screen.getByText('This link only worked once.')).toBeDefined();
    expect(screen.queryByPlaceholderText(/XXXXXX/)).toBeNull();
    fireEvent.click(screen.getByTestId('retry-connect'));
    expect(actions.connect).toHaveBeenCalledTimes(1);
  });

  it('goes back to the code form to try a different code after a failure', () => {
    const { actions } = renderReceiver('error', { error: 'This room no longer exists.' });

    fireEvent.click(screen.getByTestId('enter-other-code'));

    expect(actions.reset).toHaveBeenCalledTimes(1);
  });

  it('shows a connecting screen, not the code form, while connecting', () => {
    const { actions } = renderReceiver('connecting');

    expect(screen.getByRole('heading', { name: /connecting/i })).toBeDefined();
    expect(screen.queryByPlaceholderText(/XXXXXX/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.reset).toHaveBeenCalledTimes(1);
  });

  it('offers to retry straight away while reconnecting', () => {
    const { actions } = renderReceiver('reconnecting', { isInvited: true });

    fireEvent.click(screen.getByTestId('retry-now'));

    expect(actions.retryNow).toHaveBeenCalledTimes(1);
  });

  it('shows that it is reconnecting while the sender is briefly away', () => {
    const { actions } = renderReceiver('reconnecting', { isInvited: true });

    expect(screen.getByRole('heading', { name: /reconnecting/i })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.cancel).toHaveBeenCalledTimes(1);
  });

  it('shows the download reconnecting after a dropped connection', () => {
    renderReceiver('transferring', { manifest: dummyManifest, metrics: dummyMetrics, isInterrupted: true });

    expect(screen.getByTestId('transfer-summary').textContent).toContain('Reconnecting…');
  });

  it('offers only what is still missing when a cut-off download could not carry on', () => {
    const manifest: TransferManifest = {
      totalBytes: 2,
      files: [
        { id: 'f1', name: 'got.txt', size: 1, type: 'text/plain' },
        { id: 'f2', name: 'missing.txt', size: 1, type: 'text/plain' },
      ],
    };

    renderReceiver('connected', {
      manifest,
      finishedFiles: { f1: { seconds: 1, isCorrupted: false } },
      hasInterruptedDownload: true,
    });

    expect(screen.getByText('Download was interrupted.')).toBeDefined();
    expect((screen.getByRole('checkbox', { name: /got\.txt/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /missing\.txt/ }) as HTMLInputElement).checked).toBe(true);
  });

  describe('choosing which files to download', () => {
    const twoFiles: TransferManifest = {
      totalBytes: 3072,
      files: [
        { id: 'f1', name: 'archive.zip', size: 1024, type: 'application/zip' },
        { id: 'f2', name: 'photo.jpg', size: 2048, type: 'image/jpeg' },
      ],
    };

    it('downloads only the ticked files', () => {
      const { actions } = renderReceiver('connected', { manifest: twoFiles });

      fireEvent.click(screen.getByRole('checkbox', { name: /archive.zip/ }));
      fireEvent.click(screen.getByTestId('start-download'));

      expect(actions.startSaving).toHaveBeenCalledWith([1]);
    });

    it('downloads everything when nothing was unticked', () => {
      const { actions } = renderReceiver('connected', { manifest: twoFiles });

      fireEvent.click(screen.getByTestId('start-download'));

      expect(actions.startSaving).toHaveBeenCalledWith(undefined);
    });

    it('counts only the ticked files under the list', () => {
      renderReceiver('connected', { manifest: twoFiles });
      expect(screen.getByTestId('file-totals').textContent).toMatch(/^2 files/);

      fireEvent.click(screen.getByRole('checkbox', { name: /archive.zip/ }));

      expect(screen.getByTestId('file-totals').textContent).toMatch(/^1 of 2 files/);
    });

    it('cannot start with nothing ticked', () => {
      renderReceiver('connected', { manifest: twoFiles });

      fireEvent.click(screen.getByRole('checkbox', { name: /archive.zip/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /photo.jpg/ }));

      expect((screen.getByTestId('start-download') as HTMLButtonElement).disabled).toBe(true);
    });

    it('keeps what was ticked through the download and after it', () => {
      const { rerender } = renderReceiver('connected', { manifest: twoFiles });
      fireEvent.click(screen.getByRole('checkbox', { name: /archive.zip/ }));

      rerender(
        <ReceiverView session={makeSession({ status: 'transferring', manifest: twoFiles, selectedFileIndices: [1] })} />
      );
      rerender(
        <ReceiverView
          session={makeSession({
            status: 'completed',
            manifest: twoFiles,
            selectedFileIndices: [1],
            finishedFiles: { f2: { seconds: 1, isCorrupted: false } },
          })}
        />
      );

      expect((screen.getByRole('checkbox', { name: /archive.zip/ }) as HTMLInputElement).checked).toBe(false);
    });

    it('marks only the files that were downloaded as done', () => {
      renderReceiver('completed', {
        manifest: twoFiles,
        selectedFileIndices: [1],
        finishedFiles: { f2: { seconds: 1, isCorrupted: false } },
      });

      expect(document.querySelectorAll('[data-status="done"]')).toHaveLength(1);
      expect(document.querySelector('[data-status="done"]')?.textContent).toContain('photo.jpg');
    });
  });
});
