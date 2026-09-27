import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiverView } from '../components/ReceiverView';
import type { TransferManifest, TransferMetrics } from '../types/transfer';

describe('ReceiverView Component UI & Interaction', () => {
  const dummyManifest: TransferManifest = {
    sessionId: 'test-session',
    pinRequired: false,
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
        manifest={null}
        transferMetrics={null}
        onStartSaving={() => {}}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
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
        manifest={dummyManifest}
        transferMetrics={null}
        onStartSaving={onStartSaving}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
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
        manifest={dummyManifest}
        transferMetrics={dummyMetrics}
        onStartSaving={() => {}}
        onTogglePause={() => {}}
        onCancelTransfer={() => {}}
        isPaused={false}
        errorMessage={null}
        isNativeFSA={true}
      />
    );

    expect(screen.getByText(/Receiving Direct to Disk/i)).toBeDefined();
    expect(screen.getByText(/Current Speed/i)).toBeDefined();
    expect(screen.getAllByText(/50%/i).length).toBeGreaterThanOrEqual(1);
  });
});
