import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSenderSession } from '../hooks/useSenderSession';
import type { AppSettings } from '../types/transfer';
import { createFakePeerConnection, createFakeServices, FakeConnection } from './utils/fakeSessionServices';

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

async function renderSenderSession() {
  const fakes = createFakeServices();
  const hook = renderHook(({ active }) => useSenderSession({ active, settings, services: fakes.services }), {
    initialProps: { active: true },
  });
  await waitFor(() => expect(hook.result.current.state.roomCode).toBe('DW-ROOM22'));
  return { ...fakes, ...hook, connection: fakes.connections[0] };
}

/** Queues a file, lets a receiver connect and approves it. */
async function startTransfer() {
  const session = await renderSenderSession();
  const peerConn = createFakePeerConnection('receiver-1');
  act(() => {
    session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
  });
  act(() => {
    session.connection.handlers.onIncomingConnection?.(peerConn);
  });
  act(() => {
    session.result.current.actions.approvePeer();
  });
  return { ...session, peerConn, engine: session.engines[0] };
}

describe('useSenderSession', () => {
  it('opens a room when active and exposes its code', async () => {
    const { connection, result } = await renderSenderSession();

    expect(connection.initSender).toHaveBeenCalledWith(settings);
    expect(result.current.state.status).toBe('waiting');
  });

  it('reports a room setup failure and opens a new room on retry', async () => {
    const fakes = createFakeServices();
    const createConnection = fakes.services.createConnection;
    fakes.services.createConnection = (handlers) => {
      const connection = createConnection(handlers) as unknown as FakeConnection;
      if (fakes.connections.length === 1) {
        connection.initSender.mockRejectedValueOnce(new Error('Server unreachable'));
      }
      return connection;
    };
    const { result } = renderHook(() => useSenderSession({ active: true, settings, services: fakes.services }));
    await waitFor(() => expect(result.current.state.error).toBe('Server unreachable'));
    expect(result.current.state.roomCode).toBe('');

    await act(async () => {
      await result.current.actions.retryRoom();
    });

    expect(fakes.connections).toHaveLength(2);
    expect(fakes.connections[0].destroy).toHaveBeenCalled();
    expect(result.current.state.roomCode).toBe('DW-ROOM22');
    expect(result.current.state.error).toBeNull();
  });

  it('asks for approval when a receiver connects and streams the queued files once approved', async () => {
    const session = await renderSenderSession();
    const peerConn = createFakePeerConnection('receiver-1');
    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
      session.result.current.actions.setPin('4321');
    });

    act(() => {
      session.connection.handlers.onIncomingConnection?.(peerConn);
    });
    expect(session.result.current.state.pendingPeerId).toBe('receiver-1');

    act(() => {
      session.result.current.actions.approvePeer();
    });

    const engine = session.engines[0];
    expect(engine.init).toHaveBeenCalledWith(peerConn, true, expect.any(Object));
    expect(engine.startSenderTransfer).toHaveBeenCalledWith([expect.objectContaining({ name: 'hello.txt', size: 5 })], '4321');
    expect(session.result.current.state.status).toBe('transferring');
    expect(session.result.current.state.pendingPeerId).toBeNull();
    expect(session.result.current.state.connectedPeerId).toBe('receiver-1');
  });

  it('closes a rejected receiver without starting a transfer', async () => {
    const session = await renderSenderSession();
    const peerConn = createFakePeerConnection('receiver-1');
    act(() => {
      session.connection.handlers.onIncomingConnection?.(peerConn);
    });

    act(() => {
      session.result.current.actions.rejectPeer();
    });

    expect(peerConn.close).toHaveBeenCalled();
    expect(session.engines).toHaveLength(0);
    expect(session.result.current.state.pendingPeerId).toBeNull();
  });

  it('drops the approval request when the receiver leaves before it is answered', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('receiver-1'));
    });

    act(() => {
      session.connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.pendingPeerId).toBeNull();
  });

  it('keeps a newer approval request when an earlier receiver closes late', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('receiver-2'));
    });

    act(() => {
      session.connection.handlers.onDisconnected?.('receiver-1');
    });

    expect(session.result.current.state.pendingPeerId).toBe('receiver-2');
    act(() => {
      session.result.current.actions.approvePeer();
    });
    expect(session.engines).toHaveLength(1);
  });

  it('shows completion together with any corrupted files', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      engine.callbacks.onAllCompleted?.({ corruptedFiles: ['hello.txt'] });
    });

    expect(result.current.state.status).toBe('completed');
    expect(result.current.state.corruptedFiles).toEqual(['hello.txt']);
  });

  it('shows a failed transfer and frees the room for the next receiver', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      engine.callbacks.onError?.('Connection to peer lost');
    });

    expect(result.current.state.status).toBe('failed');
    expect(result.current.state.error).toBe('Connection to peer lost');
    expect(connection.disconnectPeer).toHaveBeenCalled();

    act(() => {
      result.current.actions.dismissError();
    });
    expect(result.current.state.status).toBe('waiting');
    expect(result.current.state.error).toBeNull();
  });

  it('returns to waiting when the receiver cancels', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      engine.callbacks.onCancelled?.();
    });

    expect(result.current.state.status).toBe('waiting');
    expect(result.current.state.metrics).toBeNull();
    expect(connection.disconnectPeer).toHaveBeenCalled();
  });

  it('cancels through the engine and frees the room', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      result.current.actions.cancel();
    });

    expect(engine.cancel).toHaveBeenCalled();
    expect(connection.disconnectPeer).toHaveBeenCalled();
    expect(result.current.state.status).toBe('waiting');
  });

  it('mirrors the pause state reported by the engine', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      result.current.actions.togglePause();
    });
    expect(engine.togglePause).toHaveBeenCalled();

    act(() => {
      engine.callbacks.onPaused?.(true);
    });
    expect(result.current.state.isPaused).toBe(true);
  });

  it('closes the room when deactivated and ignores late events from the old session', async () => {
    const { engine, connection, result, rerender } = await startTransfer();

    rerender({ active: false });
    act(() => {
      engine.callbacks.onError?.('Connection to peer lost');
    });

    expect(connection.destroy).toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.error).toBeNull();
  });

  it('starts over with an empty queue after "send more files"', async () => {
    const { engine, connection, result } = await startTransfer();
    act(() => {
      engine.callbacks.onAllCompleted?.({ corruptedFiles: [] });
    });

    act(() => {
      result.current.actions.clearFiles();
    });

    expect(result.current.state.files).toEqual([]);
    expect(result.current.state.status).toBe('waiting');
    expect(connection.disconnectPeer).toHaveBeenCalled();
  });
});
