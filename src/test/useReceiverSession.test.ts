import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReceiverSession } from '../hooks/useReceiverSession';
import type { AppSettings, TransferManifest } from '../types/transfer';
import { createFakeServices } from './utils/fakeSessionServices';

const settings: AppSettings = {
  useCustomSignaling: false,
  signalingHost: '',
  signalingPort: 9000,
  signalingPath: '/',
  signalingSecure: true,
  customStunTurn: [],
  enableAudioAlerts: false,
  enableWakeLock: false,
};

const manifest: TransferManifest = {
  sessionId: 's',
  totalBytes: 5,
  files: [{ id: 'f1', name: 'hello.txt', size: 5, type: 'text/plain', chunkSize: 65536, totalChunks: 1 }],
};

function renderReceiverSession(initialRoomCode = '') {
  const fakes = createFakeServices();
  const hook = renderHook(
    ({ active }) => useReceiverSession({ active, settings, initialRoomCode, services: fakes.services }),
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
    handles.engine.callbacks.onManifest?.(manifest);
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
    expect(session.engines[0].init).toHaveBeenCalledWith(expect.anything(), false, expect.any(Object));
    expect(session.result.current.state.status).toBe('waiting_approval');
  });

  it('shows the incoming files once the sender approves', async () => {
    const session = renderReceiverSession();

    await connectWithManifest(session);

    expect(session.result.current.state.status).toBe('connected');
    expect(session.result.current.state.manifest).toEqual(manifest);
  });

  it('asks for the PIN when the sender requires one', async () => {
    const session = renderReceiverSession();
    const { engine } = await connect(session);

    act(() => {
      engine.callbacks.onPinRequired?.({ attemptsLeft: 3, incorrect: false });
    });

    expect(session.result.current.state.status).toBe('pin_required');
    expect(session.result.current.state.pinPrompt).toEqual({ attemptsLeft: 3, incorrect: false });
  });

  it('submits the entered PIN and waits for the sender', async () => {
    const session = renderReceiverSession();
    const { engine } = await connect(session);
    act(() => {
      engine.callbacks.onPinRequired?.({ attemptsLeft: 3, incorrect: false });
    });
    act(() => {
      session.result.current.actions.setPin('1234');
    });

    act(() => {
      session.result.current.actions.submitPin();
    });

    expect(engine.submitPin).toHaveBeenCalledWith('1234');
    expect(session.result.current.state.status).toBe('waiting_approval');
  });

  it('clears the PIN field and shows remaining attempts after a wrong PIN', async () => {
    const session = renderReceiverSession();
    const { engine } = await connect(session);
    act(() => {
      session.result.current.actions.setPin('0000');
    });

    act(() => {
      engine.callbacks.onPinRequired?.({ attemptsLeft: 2, incorrect: true });
    });

    expect(session.result.current.state.pin).toBe('');
    expect(session.result.current.state.pinPrompt).toEqual({ attemptsLeft: 2, incorrect: true });
  });

  it('reports a sender that goes away while the PIN is being entered', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connect(session);
    act(() => {
      engine.callbacks.onPinRequired?.({ attemptsLeft: 3, incorrect: false });
    });

    act(() => {
      connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.status).toBe('error');
  });

  it('reports a sender that declines or goes away before approving', async () => {
    const session = renderReceiverSession();
    const { connection } = await connect(session);

    act(() => {
      connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.status).toBe('error');
    expect(session.result.current.state.error).toMatch(/declined|offline/i);
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

  it('shows the transfer while saving', async () => {
    const session = renderReceiverSession();
    await connectWithManifest(session);

    await act(async () => {
      await session.result.current.actions.startSaving();
    });

    expect(session.result.current.state.status).toBe('transferring');
  });

  it('shows completion with corrupted files and leaves the room gracefully', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connectWithManifest(session);

    act(() => {
      engine.callbacks.onAllCompleted?.({ corruptedFiles: ['hello.txt'] });
    });

    expect(session.result.current.state.status).toBe('completed');
    expect(session.result.current.state.corruptedFiles).toEqual(['hello.txt']);
    expect(connection.disconnectPeer).toHaveBeenCalled();
  });

  it('shows why the transfer failed and leaves the room', async () => {
    const session = renderReceiverSession();
    const { engine, connection } = await connectWithManifest(session);

    act(() => {
      engine.callbacks.onError?.('Disk full');
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
      engine.callbacks.onCancelled?.();
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
      engine.callbacks.onAllCompleted?.({ corruptedFiles: [] });
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
      engine.callbacks.onError?.('Connection to peer lost');
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
      engine.callbacks.onPaused?.(true);
    });

    expect(engine.togglePause).toHaveBeenCalled();
    expect(session.result.current.state.isPaused).toBe(true);
  });
});

