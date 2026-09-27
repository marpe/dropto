import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiverView } from '../components/ReceiverView';
import type { ComponentProps } from 'react';
import type { ReceiverStatus, TransferManifest, TransferMetrics } from '../types/transfer';

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

  it('renders room code input initially and connects', () => {
    const onConnect = vi.fn();
    render(
      <ReceiverView
        roomCode="DW-123456"
        onRoomCodeChange={() => {}}
        pin=""
        onPinChange={() => {}}
        onConnect={onConnect}
        connectionState="idle"
        pinPrompt={null}
        onSubmitPin={() => {}}
        manifest={null}
        transferMetrics={null}
        onStartSaving={() => {}}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
        corruptedFiles={[]}
        onReset={() => {}}
      />
    );

    const connectBtn = screen.getByTestId('connect');
    expect(connectBtn).toBeDefined();
    fireEvent.click(connectBtn);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('triggers onStartSaving and shows loading feedback when clicking "Select Save Location & Start Download"', async () => {
    let resolveSave: () => void = () => {};
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });

    const onStartSaving = vi.fn().mockImplementation(() => savePromise);

    render(
      <ReceiverView
        roomCode="DW-123456"
        onRoomCodeChange={() => {}}
        pin=""
        onPinChange={() => {}}
        onConnect={() => {}}
        connectionState="connected"
        pinPrompt={null}
        onSubmitPin={() => {}}
        manifest={dummyManifest}
        transferMetrics={null}
        onStartSaving={onStartSaving}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
        corruptedFiles={[]}
        onReset={() => {}}
      />
    );

    const saveButton = screen.getByRole('button', { name: /select save location & start download/i });
    expect(saveButton).toBeDefined();

    // Click the button
    fireEvent.click(saveButton);
    expect(onStartSaving).toHaveBeenCalledTimes(1);

    // Verify loading feedback immediately appears
    expect(screen.getByText(/opening file dialog/i)).toBeDefined();

    // Resolve the promise
    resolveSave();
    await waitFor(() => {
      expect(screen.queryByText(/opening file dialog/i)).toBeNull();
    });
  });

  function renderWaiting(connectionState: ReceiverStatus, extra: Partial<ComponentProps<typeof ReceiverView>> = {}) {
    const onCancelTransfer = vi.fn();
    render(
      <ReceiverView
        roomCode="DW-123456"
        onRoomCodeChange={() => {}}
        pin=""
        onPinChange={() => {}}
        onConnect={() => {}}
        connectionState={connectionState}
        pinPrompt={null}
        onSubmitPin={() => {}}
        manifest={null}
        transferMetrics={null}
        onStartSaving={() => {}}
        onTogglePause={() => {}}
        onCancelTransfer={onCancelTransfer}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
        corruptedFiles={[]}
        onReset={() => {}}
        {...extra}
      />
    );
    return { onCancelTransfer };
  }

  it('shows that the sender is being asked to accept, with a way to cancel', () => {
    const { onCancelTransfer } = renderWaiting('waiting_approval');

    expect(screen.getByRole('heading', { name: /waiting for the sender to accept/i })).toBeDefined();
    expect(screen.getByText('DW-123456')).toBeDefined();
    expect(screen.queryByPlaceholderText(/XXXXXX/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelTransfer).toHaveBeenCalledTimes(1);
  });

  it('shows that a submitted PIN is being checked', () => {
    renderWaiting('verifying_pin');

    expect(screen.getByRole('heading', { name: /checking pin/i })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /waiting for the sender to accept/i })).toBeNull();
  });

  function renderReadyToSave(isNativeFSA: boolean) {
    render(
      <ReceiverView
        roomCode="DW-123456"
        onRoomCodeChange={() => {}}
        pin=""
        onPinChange={() => {}}
        onConnect={() => {}}
        connectionState="connected"
        pinPrompt={null}
        onSubmitPin={() => {}}
        manifest={dummyManifest}
        transferMetrics={null}
        onStartSaving={() => {}}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={isNativeFSA}
        corruptedFiles={[]}
        onReset={() => {}}
      />
    );
  }

  it('warns that files are held in memory when the browser cannot stream to disk', () => {
    renderReadyToSave(false);

    expect(screen.getByText(/held in memory/i)).toBeDefined();
    expect(screen.queryByText(/straight to disk/i)).toBeNull();
  });

  it('promises disk streaming only when the browser supports it', () => {
    renderReadyToSave(true);

    expect(screen.queryByText(/held in memory/i)).toBeNull();
    expect(screen.getByText(/straight to disk/i)).toBeDefined();
  });

  function renderPinStep(overrides: { pin?: string; isIncorrect?: boolean; attemptsLeft?: number } = {}) {
    const onSubmitPin = vi.fn();
    const onPinChange = vi.fn();
    render(
      <ReceiverView
        roomCode="DW-123456"
        onRoomCodeChange={() => {}}
        pin={overrides.pin ?? '1234'}
        onPinChange={onPinChange}
        onConnect={() => {}}
        connectionState="pin_required"
        pinPrompt={{ attemptsLeft: overrides.attemptsLeft ?? 3, isIncorrect: overrides.isIncorrect ?? false }}
        onSubmitPin={onSubmitPin}
        manifest={null}
        transferMetrics={null}
        onStartSaving={() => {}}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
        corruptedFiles={[]}
        onReset={() => {}}
      />
    );
    return { onSubmitPin, onPinChange };
  }

  it('asks for the session PIN and submits it', () => {
    const { onSubmitPin, onPinChange } = renderPinStep();

    fireEvent.change(screen.getByPlaceholderText(/pin/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }));

    expect(onPinChange).toHaveBeenCalledWith('12345');
    expect(onSubmitPin).toHaveBeenCalledTimes(1);
  });

  it('shows the remaining attempts after a wrong PIN', () => {
    renderPinStep({ pin: '', isIncorrect: true, attemptsLeft: 2 });

    expect(screen.getByText(/incorrect pin/i).textContent).toMatch(/2 attempts left/i);
  });

  it('displays the metrics dashboard once connectionState is transferring', () => {
    const dummyMetrics: TransferMetrics = {
      currentSpeed: 1048576 * 15, // 15 MB/s
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
    };

    render(
      <ReceiverView
        roomCode="DW-123456"
        onRoomCodeChange={() => {}}
        pin=""
        onPinChange={() => {}}
        onConnect={() => {}}
        connectionState="transferring"
        pinPrompt={null}
        onSubmitPin={() => {}}
        manifest={dummyManifest}
        transferMetrics={dummyMetrics}
        onStartSaving={() => {}}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
        corruptedFiles={[]}
        onReset={() => {}}
      />
    );

    expect(screen.getByText(/Receiving Direct to Disk/i)).toBeDefined();
    expect(screen.getByText(/Current Speed/i)).toBeDefined();
    expect(screen.getAllByText(/50%/i).length).toBeGreaterThanOrEqual(1);
  });

  it('waits for the files, not for approval, after opening the sender link', () => {
    renderWaiting('waiting_approval', { isInvited: true });

    expect(screen.getByRole('heading', { name: /waiting for the sender.s files/i })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /waiting for the sender to accept/i })).toBeNull();
  });

  it('keeps waiting while the sender has not queued any files yet', () => {
    renderWaiting('connected', { isInvited: true, manifest: { totalBytes: 0, files: [] } });

    expect(screen.getByRole('heading', { name: /waiting for the sender.s files/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /start download/i })).toBeNull();
  });

  it('marks offered files with an icon for their type', () => {
    renderWaiting('connected', { manifest: dummyManifest });

    expect(document.querySelector('[data-file-kind="archive"]')).not.toBeNull();
  });

  it('offers going back to sending from the room code form', () => {
    const onSwitchToSend = vi.fn();
    renderWaiting('idle', { onSwitchToSend });

    fireEvent.click(screen.getByRole('button', { name: /send files instead/i }));

    expect(onSwitchToSend).toHaveBeenCalledTimes(1);
  });

  it('connects when Enter is pressed in the room code field', () => {
    const onConnect = vi.fn();
    renderWaiting('idle', { onConnect });

    fireEvent.submit(screen.getByPlaceholderText(/XXXXXX/));

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows a connecting screen, not the code form, while connecting', () => {
    const onReset = vi.fn();
    renderWaiting('connecting', { onReset });

    expect(screen.getByRole('heading', { name: /connecting/i })).toBeDefined();
    expect(screen.queryByPlaceholderText(/XXXXXX/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows the place in line while the sender is busy with others', () => {
    renderWaiting('queued', { queuePosition: 3 });

    expect(screen.getByRole('heading', { name: /in line/i })).toBeDefined();
    expect(screen.getByText(/2 people ahead of you/i)).toBeDefined();
  });

  it('says so when next in line', () => {
    renderWaiting('queued', { queuePosition: 1 });

    expect(screen.getByText(/you.re next/i)).toBeDefined();
  });

  it('shows that it is reconnecting while the sender is briefly away', () => {
    const { onCancelTransfer } = renderWaiting('reconnecting', { isInvited: true });

    expect(screen.getByRole('heading', { name: /reconnecting/i })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelTransfer).toHaveBeenCalledTimes(1);
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
      const onStartSaving = vi.fn();
      renderWaiting('connected', { manifest: twoFiles, onStartSaving });

      fireEvent.click(screen.getByRole('checkbox', { name: /archive.zip/ }));
      fireEvent.click(screen.getByTestId('start-download'));

      expect(onStartSaving).toHaveBeenCalledWith([1]);
    });

    it('downloads everything when nothing was unticked', () => {
      const onStartSaving = vi.fn();
      renderWaiting('connected', { manifest: twoFiles, onStartSaving });

      fireEvent.click(screen.getByTestId('start-download'));

      expect(onStartSaving).toHaveBeenCalledWith(undefined);
    });

    it('cannot start with nothing ticked', () => {
      renderWaiting('connected', { manifest: twoFiles });

      fireEvent.click(screen.getByRole('checkbox', { name: /archive.zip/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /photo.jpg/ }));

      expect((screen.getByTestId('start-download') as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows progress and results for the chosen files only', () => {
      renderWaiting('completed', { manifest: twoFiles, selectedFileIndices: [1], corruptedFiles: [] });

      expect(screen.getByText(/^1 file · /)).toBeDefined();
    });
  });
});
