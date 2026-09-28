import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReceiverSession } from '../hooks/useReceiverSession';
import type { AppSettings, TransferManifest } from '../types/transfer';
import { createFakeServices, FakeConnection } from './utils/fakeSessionServices';

const settings: AppSettings = {
  useCustomSignaling: false,
  signalingHost: '',
  signalingPort: 9000,
  signalingPath: '/',
  signalingSecure: true,
  customStunTurn: [],
  enableAudioAlerts: false,
};

const manifest: TransferManifest = {
  totalBytes: 5,
  files: [{ id: 'f1', name: 'hello.txt', size: 5, type: 'text/plain' }],
};

function renderReceiverSession(
  roomCode = '',
  shareKey: string | null = null,
  fakes = createFakeServices(),
  reconnectDelayMs = 0
) {
  const shareLink = { roomCode, shareKey };
  const hook = renderHook(
    ({ active }) => useReceiverSession({ active, settings, shareLink, services: fakes.services, reconnectDelayMs }),
    { initialProps: { active: true } }
  );
  return { ...fakes, ...hook };
}

async function connect(session: ReturnType<typeof renderReceiverSession>) {
  act(() => {
    session.result.current.actions.setRoomCode('DW-ROOM22');
  });
  await act(async () => {
    await session.result.current.actions.connect();
  });
  return { connection: session.connections[0], engine: session.engines[0] };
}

async function connectWithManifest(session: ReturnType<typeof renderReceiverSession>) {
  const handles = await connect(session);
  act(() => {
    handles.engine.events.onManifest?.(manifest);
  });
  return handles;
}

describe('useReceiverSession', () => {
  it('starts with the room code from a share link', () => {
    const { result } = renderReceiverSession('DW-SHARED');

    expect(result.current.state.roomCode).toBe('DW-SHARED');
  });

  it('connects to the room and waits for the sender to approve', async () => {
    const session = renderReceiverSession();
    act(() => {
      session.result.current.actions.setRoomCode('  dw-room22 ');
    });

    await act(async () => {
      await session.result.current.actions.connect();
    });

    expect(session.connections[0].initReceiver).toHaveBeenCalledWith('DW-ROOM22', settings);
    expect(session.engines).toHaveLength(1);
    expect(session.result.current.state.status).toBe('waiting_approval');
  });

  it('shows the incoming files once the sender approves', async () => {
    const session = renderReceiverSession();

    await connectWithManifest(session);

    expect(session.result.current.state.status).toBe('connected');
    expect(session.result.current.state.manifest).toEqual(manifest);
  });

  it('ignores a place in line outside a download, since only downloads wait for a slot', async () => {
    const session = renderReceiverSession();
    const { engine } = await connect(session);

    act(() => {
      engine.events.onQueued?.(2);
    });

    expect(session.result.current.state.status).toBe('waiting_approval');
    expect(session.result.current.state.queuePosition).toBeNull();
  });

  it('asks for the PIN when the sender requires one', async () => {
    const session = renderReceiverSession();
    const { engine } = await connect(session);

    act(() => {
      engine.events.onPinRequired?.({ attemptsLeft: 3, isIncorrect: false });
    });

    expect(session.result.current.state.status).toBe('pin_required');
    expect(session.result.current.state.pinPrompt).toEqual({ attemptsLeft: 3, isIncorrect: false });
  });

  it('submits the entered PIN and shows it is being checked', async () => {
    const session = renderReceiverSession();
    const { engine } = await connect(session);
    act(() => {
      engine.events.onPinRequired?.({ attemptsLeft: 3, isIncorrect: false });
    });
    act(() => {
      session.result.current.actions.setPin('1234');
    });

    act(() => {
      session.result.current.actions.submitPin();
    });

    expect(engine.submitPin).toHaveBeenCalledWith('1234');
    expect(session.result.current.state.status).toBe('verifying_pin');
  });

  it('retries a sender that goes away while the PIN is being checked', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connect(session);
    act(() => {
      engine.events.onPinRequired?.({ attemptsLeft: 3, isIncorrect: false });
    });
    act(() => {
      session.result.current.actions.submitPin();
    });

    act(() => {
      connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.status).toBe('reconnecting');
    await waitFor(() => expect(session.connections).toHaveLength(2));
  });

  it('can stop waiting for approval, leaving the room and returning to the form', async () => {
    const session = renderReceiverSession();
    const { connection } = await connect(session);
    expect(session.result.current.state.status).toBe('waiting_approval');

    act(() => {
      session.result.current.actions.cancel();
    });
    // The graceful close that follows must not be reported as the sender declining
    act(() => {
      connection.handlers.onDisconnected?.();
    });

    expect(connection.disconnectPeer).toHaveBeenCalled();
    expect(session.result.current.state.status).toBe('idle');
    expect(session.result.current.state.error).toBeNull();
    expect(session.result.current.state.roomCode).toBe('DW-ROOM22');
  });

  it('clears the PIN field and shows remaining attempts after a wrong PIN', async () => {
    const session = renderReceiverSession();
    const { engine } = await connect(session);
    act(() => {
      session.result.current.actions.setPin('0000');
    });

    act(() => {
      engine.events.onPinRequired?.({ attemptsLeft: 2, isIncorrect: true });
    });

    expect(session.result.current.state.pin).toBe('');
    expect(session.result.current.state.pinPrompt).toEqual({ attemptsLeft: 2, isIncorrect: true });
  });

  it('retries a sender that goes away while the PIN is being entered', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connect(session);
    act(() => {
      engine.events.onPinRequired?.({ attemptsLeft: 3, isIncorrect: false });
    });

    act(() => {
      connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.status).toBe('reconnecting');
  });

  it('retries a sender that goes away before approving, even with a typed room code', async () => {
    const session = renderReceiverSession();
    const { connection } = await connect(session);

    act(() => {
      connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.status).toBe('reconnecting');
    await waitFor(() => expect(session.connections).toHaveLength(2));
  });

  it('stops, with the reason, when the sender declines', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connect(session);

    act(() => {
      engine.events.onError?.('The sender declined your request.');
    });
    act(() => {
      connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.status).toBe('error');
    expect(session.result.current.state.error).toMatch(/declined/i);
    expect(session.connections).toHaveLength(1);
  });

  it('retries straight away when asked, instead of waiting for the next attempt', async () => {
    const session = renderReceiverSession('', null, createFakeServices(), 60_000);
    const { connection } = await connect(session);
    act(() => {
      connection.handlers.onDisconnected?.();
    });
    expect(session.connections).toHaveLength(1);

    act(() => {
      session.result.current.actions.retryNow();
    });

    await waitFor(() => expect(session.connections).toHaveLength(2));
  });

  it('reports a room that cannot be reached', async () => {
    const session = renderReceiverSession();
    const createConnection = session.services.createConnection;
    session.services.createConnection = (handlers) => {
      const connection = createConnection(handlers);
      (connection.initReceiver as any).mockRejectedValueOnce(new Error('Could not connect to peer DW-ROOM22'));
      return connection;
    };

    await connect(session);

    expect(session.result.current.state.status).toBe('error');
    expect(session.result.current.state.error).toBe('Could not connect to peer DW-ROOM22');
    expect(session.connections[0].destroy).toHaveBeenCalled();
  });

  it('returns to the file list when the save dialog is dismissed', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);
    engine.startReceiving.mockResolvedValueOnce(false);

    await act(async () => {
      await session.result.current.actions.startSaving();
    });

    expect(engine.startReceiving).toHaveBeenCalled();
    expect(session.result.current.state.status).toBe('connected');
  });

  it('asks for notification permission from the download click', async () => {
    const session = renderReceiverSession();
    await connectWithManifest(session);

    await act(async () => {
      await session.result.current.actions.startSaving();
    });

    expect(session.effects.onTransferRequested).toHaveBeenCalledTimes(1);
  });

  it('holds device effects from the start of saving until completion', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);
    expect(session.effects.onTransferStarted).not.toHaveBeenCalled();

    await act(async () => {
      await session.result.current.actions.startSaving();
    });
    expect(session.effects.onTransferStarted).toHaveBeenCalledTimes(1);

    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: [] });
    });
    expect(session.effects.onTransferEnded).toHaveBeenCalledWith(true);
  });

  it('never starts device effects when the save dialog is dismissed', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);
    engine.startReceiving.mockResolvedValueOnce(false);

    await act(async () => {
      await session.result.current.actions.startSaving();
    });
    act(() => {
      session.result.current.actions.cancel();
    });

    expect(session.effects.onTransferStarted).not.toHaveBeenCalled();
    expect(session.effects.onTransferEnded).not.toHaveBeenCalled();
  });

  it('downloads only the files the user picked', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);

    await act(async () => {
      await session.result.current.actions.startSaving([0]);
    });

    expect(engine.startReceiving).toHaveBeenCalledWith([0]);
    expect(session.result.current.state.selectedFileIndices).toEqual([0]);
  });

  it('shows the transfer while saving', async () => {
    const session = renderReceiverSession();
    await connectWithManifest(session);

    await act(async () => {
      await session.result.current.actions.startSaving();
    });

    expect(session.result.current.state.status).toBe('transferring');
  });

  it('shows completion with corrupted files and stays connected for another download', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connectWithManifest(session);

    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: ['hello.txt'] });
    });

    expect(session.result.current.state.status).toBe('completed');
    expect(session.result.current.state.corruptedFiles).toEqual(['hello.txt']);
    expect(session.result.current.state.finishedFiles).toEqual({ f1: { seconds: null, isCorrupted: true } });
    expect(connection.disconnectPeer).not.toHaveBeenCalled();
  });

  it('downloads again from the same list after finishing', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);
    await act(async () => {
      await session.result.current.actions.startSaving();
    });
    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: [] });
    });

    await act(async () => {
      await session.result.current.actions.startSaving();
    });

    expect(engine.startReceiving).toHaveBeenCalledTimes(2);
    expect(session.result.current.state.status).toBe('transferring');
    expect(session.effects.onTransferStarted).toHaveBeenCalledTimes(2);
  });

  it('keeps finished files marked when the sender adds more after a download', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);
    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: [] });
    });

    const grown: TransferManifest = {
      totalBytes: 8,
      files: [...manifest.files, { id: 'f2', name: 'more.txt', size: 3, type: 'text/plain' }],
    };
    act(() => {
      engine.events.onManifest?.(grown);
    });

    expect(session.result.current.state.status).toBe('completed');
    expect(session.result.current.state.manifest).toEqual(grown);
    expect(Object.keys(session.result.current.state.finishedFiles)).toEqual(['f1']);
  });

  it('retries a sender that leaves after a finished download, remembering what was downloaded', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);
    await act(async () => {
      await session.result.current.actions.startSaving();
    });
    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: [] });
    });

    act(() => {
      engine.events.onPeerLeft?.();
    });

    expect(session.result.current.state.status).toBe('reconnecting');
    expect(Object.keys(session.result.current.state.finishedFiles).length).toBeGreaterThan(0);
    await waitFor(() => expect(session.connections).toHaveLength(2));
  });

  it('shows its place in line within the download when the sender is busy', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);
    await act(async () => {
      await session.result.current.actions.startSaving();
    });

    act(() => {
      engine.events.onQueued?.(2);
    });
    expect(session.result.current.state.status).toBe('transferring');
    expect(session.result.current.state.queuePosition).toBe(2);

    act(() => {
      engine.events.onMetrics?.({
        currentSpeed: 1,
        averageSpeed: 1,
        elapsedSeconds: 1,
        etaSeconds: 4,
        bytesTransferred: 1,
        totalBytes: 5,
        overallPercent: 20,
        currentFileIndex: 0,
        totalFiles: 1,
        currentFileName: 'hello.txt',
        currentFilePercent: 20,
        fileSeconds: [],
      });
    });
    expect(session.result.current.state.queuePosition).toBeNull();
  });

  it('shows why the transfer failed and leaves the room', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connectWithManifest(session);

    act(() => {
      engine.events.onError?.('Disk full');
    });

    expect(session.result.current.state.status).toBe('error');
    expect(session.result.current.state.error).toBe('Disk full');
    expect(session.result.current.state.manifest).toBeNull();
    expect(connection.disconnectPeer).toHaveBeenCalled();
  });

  it('tells the user when the sender cancels', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);

    act(() => {
      engine.events.onCancelled?.();
    });

    expect(session.result.current.state.status).toBe('error');
    expect(session.result.current.state.error).toMatch(/cancelled/i);
  });

  it('cancels through the engine and leaves the room', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connectWithManifest(session);

    act(() => {
      session.result.current.actions.cancel();
    });

    expect(engine.cancel).toHaveBeenCalled();
    expect(connection.disconnectPeer).toHaveBeenCalled();
    expect(session.result.current.state.status).toBe('idle');
    expect(session.result.current.state.manifest).toBeNull();
  });

  it('can receive again after a completed transfer without reloading', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connectWithManifest(session);
    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: [] });
    });

    act(() => {
      session.result.current.actions.reset();
    });

    expect(connection.destroy).toHaveBeenCalled();
    expect(session.result.current.state.status).toBe('idle');
    expect(session.result.current.state.manifest).toBeNull();
    expect(session.result.current.state.corruptedFiles).toEqual([]);
  });

  it('closes the connection when deactivated and ignores late events', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connectWithManifest(session);

    session.rerender({ active: false });
    act(() => {
      engine.events.onError?.('Connection to peer lost');
    });

    expect(connection.destroy).toHaveBeenCalled();
    expect(session.result.current.state.error).toBeNull();
  });

  it('mirrors the pause state reported by the engine', async () => {
    const session = renderReceiverSession();
    const { engine } = await connectWithManifest(session);

    act(() => {
      session.result.current.actions.togglePause();
    });
    act(() => {
      engine.events.onPaused?.(true);
    });

    expect(engine.togglePause).toHaveBeenCalled();
    expect(session.result.current.state.isPaused).toBe(true);
  });

  it('waits for the user to connect when the link carries no key', () => {
    const session = renderReceiverSession('DW-ROOM22');

    expect(session.connections).toHaveLength(0);
    expect(session.result.current.state.status).toBe('idle');
  });

  it('starts out connecting when opened through a share link, so the code form never flashes', () => {
    const fakes = createFakeServices();
    const shareLink = { roomCode: 'DW-ROOM22', shareKey: 'link-key' };
    const firstStatuses: string[] = [];
    renderHook(() => {
      const session = useReceiverSession({
        active: true,
        settings,
        shareLink,
        services: fakes.services,
      });
      firstStatuses.push(session.state.status);
      return session;
    });

    // The first render is what paints before the connecting effect runs
    expect(firstStatuses[0]).toBe('connecting');
  });

  it('connects straight away when opened through a share link, presenting its key', async () => {
    const session = renderReceiverSession('DW-ROOM22', 'link-key');

    await waitFor(() => expect(session.result.current.state.status).toBe('waiting_approval'));

    expect(session.connections[0].initReceiver).toHaveBeenCalledWith('DW-ROOM22', settings);
    expect(session.engines[0].options.shareKey).toBe('link-key');
    expect(session.engines[0].options.introduction).toEqual(expect.objectContaining({ timeZone: expect.any(String) }));
    expect(session.result.current.state.isInvited).toBe(true);
  });

  it('never presents the link key to a different room', async () => {
    const session = renderReceiverSession('DW-ROOM22', 'link-key');
    await waitFor(() => expect(session.engines).toHaveLength(1));

    act(() => {
      session.result.current.actions.setRoomCode('DW-OTHER2');
    });
    await act(async () => {
      await session.result.current.actions.connect();
    });

    expect(session.engines[1].options.shareKey).toBeNull();
    expect(session.result.current.state.isInvited).toBe(false);
  });

  it('connects with the key when a whole share link is pasted into the code field', async () => {
    const session = renderReceiverSession();

    await act(async () => {
      session.result.current.actions.setRoomCode('https://dropto.space/?room=dt-abc234#key=Pasted_Key');
    });

    expect(session.result.current.state.roomCode).toBe('DT-ABC234');
    expect(session.connections[0].initReceiver).toHaveBeenCalledWith('DT-ABC234', settings);
    expect(session.engines[0].options.shareKey).toBe('Pasted_Key');
  });

  it('keeps typed room codes upper-case', () => {
    const session = renderReceiverSession();

    act(() => {
      session.result.current.actions.setRoomCode('dw-abc');
    });

    expect(session.result.current.state.roomCode).toBe('DW-ABC');
    expect(session.connections).toHaveLength(0);
  });

  describe('when the sender goes away before the download', () => {
    async function openLink(fakes = createFakeServices()) {
      const session = renderReceiverSession('DW-ROOM22', 'link-key', fakes);
      await waitFor(() => expect(session.result.current.state.status).toBe('waiting_approval'));
      return session;
    }

    /** Services whose later connections cannot find the room, as while the sender page reloads. */
    function senderStaysAway() {
      const fakes = createFakeServices();
      const createConnection = fakes.services.createConnection;
      fakes.services.createConnection = (handlers) => {
        const connection = createConnection(handlers) as unknown as FakeConnection;
        if (fakes.connections.length > 1) {
          connection.initReceiver.mockRejectedValue(Object.assign(new Error('gone'), { type: 'peer-unavailable' }));
        }
        return connection;
      };
      return fakes;
    }

    it('reconnects on its own with the link key, e.g. after the sender reloads', async () => {
      const session = await openLink();

      act(() => {
        session.connections[0].handlers.onDisconnected?.();
      });

      await waitFor(() => expect(session.engines).toHaveLength(2));
      expect(session.connections[0].destroy).toHaveBeenCalled();
      expect(session.engines[1].options.shareKey).toBe('link-key');
      await waitFor(() => expect(session.result.current.state.status).toBe('waiting_approval'));
    });

    it('also reconnects when the connection drops after the files were offered', async () => {
      const session = await openLink();
      act(() => {
        session.engines[0].events.onManifest?.(manifest);
      });

      act(() => {
        session.engines[0].events.onPeerLeft?.();
      });

      await waitFor(() => expect(session.engines).toHaveLength(2));
    });

    it('gives up after a while and says the sender is gone', async () => {
      const session = await openLink(senderStaysAway());

      act(() => {
        session.connections[0].handlers.onDisconnected?.();
      });

      // Ten attempts, each a few async steps: allow for a busy test run
      await waitFor(() => expect(session.result.current.state.status).toBe('error'), { timeout: 3000 });
      expect(session.connections.length).toBeGreaterThan(2);
      expect(session.result.current.state.error).toBeTruthy();
    });

    it('keeps the reason when the sender turns the link away, instead of reconnecting', async () => {
      const session = await openLink();

      act(() => {
        session.engines[0].events.onError?.('This link has already been used.');
      });
      act(() => {
        session.connections[0].handlers.onDisconnected?.();
      });

      expect(session.result.current.state.status).toBe('error');
      expect(session.result.current.state.error).toBe('This link has already been used.');
      expect(session.connections).toHaveLength(1);
    });

    it('reconnects while waiting in line, like before the files were offered', async () => {
      const session = await openLink();
      act(() => {
        session.engines[0].events.onQueued?.(1);
      });

      act(() => {
        session.engines[0].events.onConnectionLost?.({ finishedCount: 0, corruptedFiles: [], resume: null });
      });

      await waitFor(() => expect(session.engines).toHaveLength(2));
    });

    it('cancels a download the connection cut off, then reconnects so it can be started again', async () => {
      const session = await openLink();
      act(() => {
        session.engines[0].events.onManifest?.(manifest);
      });
      await act(async () => {
        await session.result.current.actions.startSaving();
      });

      act(() => {
        session.engines[0].events.onConnectionLost?.({ finishedCount: 0, corruptedFiles: [], resume: null });
      });

      expect(session.engines[0].cancel).toHaveBeenCalled();
      expect(session.result.current.state.status).toBe('reconnecting');
      await waitFor(() => expect(session.engines).toHaveLength(2));
    });
  });
});
