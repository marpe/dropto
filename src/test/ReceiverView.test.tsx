import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiverView } from '../components/ReceiverView';
import type { TransferManifest, TransferMetrics } from '../types/transfer';

describe('ReceiverView Component UI & Interaction', () => {
  const dummyManifest: TransferManifest = {
    sessionId: 'test-session',
    totalBytes: 1048576,
    files: [
      {
        id: 'f1',
        name: 'archive.zip',
        size: 1048576,
        type: 'application/zip',
        chunkSize: 65536,
        totalChunks: 16,
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

    const connectBtn = screen.getByRole('button', { name: /connect & download/i });
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

  function renderWaiting(connectionState: 'waiting_approval' | 'verifying_pin') {
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
    expect(screen.queryByText(/stream direct to disk/i)).toBeNull();
  });

  it('promises disk streaming only when the browser supports it', () => {
    renderReadyToSave(true);

    expect(screen.queryByText(/held in memory/i)).toBeNull();
    expect(screen.getByText(/stream direct to disk/i)).toBeDefined();
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
});
