import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSenderSession } from '../hooks/useSenderSession';
import type { AppSettings } from '../types/transfer';
import { SENDER_ROOM_STORAGE_KEY } from '../utils/roomMemory';
import { createFakePeerConnection, createFakeServices, FakeConnection } from './utils/fakeSessionServices';

// A receiver that typed the room code in, rather than opening the sender's link
const typedCode = { shareKey: null };

const settings: AppSettings = {
  useCustomSignaling: false,
  signalingHost: '',
  signalingPort: 9000,
  signalingPath: '/',
  signalingSecure: true,
  customStunTurn: [],
  enableAudioAlerts: false,
  enableWakeLock: false,
  enableNotifications: false,
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
    session.connection.handlers.onIncomingConnection?.(peerConn, typedCode);
  });
  act(() => {
    session.result.current.actions.approvePeer();
  });
  return { ...session, peerConn, engine: session.engines[0] };
}

describe('useSenderSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('opens a room when active and exposes its code', async () => {
    const { connection, result } = await renderSenderSession();

    expect(connection.initSender).toHaveBeenCalledWith(settings, { preferredRoomId: undefined });
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
      session.connection.handlers.onIncomingConnection?.(peerConn, typedCode);
    });
    expect(session.result.current.state.pendingPeerId).toBe('receiver-1');

    act(() => {
      session.result.current.actions.approvePeer();
    });

    const engine = session.engines[0];
    expect(engine.conn).toBe(peerConn);
    expect(engine.start).toHaveBeenCalledWith([expect.objectContaining({ name: 'hello.txt', size: 5 })], '4321');
    // The receiver is now choosing where to save; nothing streams until it asks
    expect(session.result.current.state.status).toBe('awaiting_receiver');
    expect(session.result.current.state.pendingPeerId).toBeNull();
    expect(session.result.current.state.connectedPeerId).toBe('receiver-1');
  });

  it('does not start a transfer when a receiver is accepted with nothing queued', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('receiver-1'), typedCode);
    });

    act(() => {
      session.result.current.actions.approvePeer();
    });

    expect(session.engines).toHaveLength(0);
    expect(session.result.current.state.status).toBe('waiting');
    expect(session.result.current.state.pendingPeerId).toBe('receiver-1');
  });

  it('closes a rejected receiver without starting a transfer', async () => {
    const session = await renderSenderSession();
    const peerConn = createFakePeerConnection('receiver-1');
    act(() => {
      session.connection.handlers.onIncomingConnection?.(peerConn, typedCode);
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
      session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('receiver-1'), typedCode);
    });

    act(() => {
      session.connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.pendingPeerId).toBeNull();
  });

  it('keeps a newer approval request when an earlier receiver closes late', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    });
    act(() => {
      session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('receiver-2'), typedCode);
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
      engine.events.onAllCompleted?.({ corruptedFiles: ['hello.txt'] });
    });

    expect(result.current.state.status).toBe('completed');
    expect(result.current.state.corruptedFiles).toEqual(['hello.txt']);
  });

  it('shows a failed transfer and frees the room for the next receiver', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      engine.events.onError?.('Connection to peer lost');
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
      engine.events.onCancelled?.();
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

  it('holds device effects (wake lock, sounds) for exactly the length of the transfer', async () => {
    const { engine, effects } = await startTransfer();
    expect(effects.onTransferStarted).toHaveBeenCalledTimes(1);
    expect(effects.onTransferEnded).not.toHaveBeenCalled();

    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: [] });
    });

    expect(effects.onTransferEnded).toHaveBeenCalledWith(true);
  });

  it('ends device effects as unsuccessful when the transfer fails', async () => {
    const { engine, effects } = await startTransfer();

    act(() => {
      engine.events.onError?.('Connection to peer lost');
    });

    expect(effects.onTransferEnded).toHaveBeenCalledWith(false);
  });

  it('mirrors the pause state reported by the engine', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      result.current.actions.togglePause();
    });
    expect(engine.togglePause).toHaveBeenCalled();

    act(() => {
      engine.events.onPaused?.(true);
    });
    expect(result.current.state.isPaused).toBe(true);
  });

  it('closes the room when deactivated and ignores late events from the old session', async () => {
    const { engine, connection, result, rerender } = await startTransfer();

    rerender({ active: false });
    act(() => {
      engine.events.onError?.('Connection to peer lost');
    });

    expect(connection.destroy).toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.error).toBeNull();
  });

  it('starts over with an empty queue after "send more files"', async () => {
    const { engine, connection, result } = await startTransfer();
    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: [] });
    });

    act(() => {
      result.current.actions.clearFiles();
    });

    expect(result.current.state.files).toEqual([]);
    expect(result.current.state.status).toBe('waiting');
    expect(connection.disconnectPeer).toHaveBeenCalled();
  });

  it('shows the transfer once the receiver starts downloading', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      engine.events.onReceiverStarted?.();
    });

    expect(result.current.state.status).toBe('transferring');
  });

  it('admits a receiver holding the link key without asking', async () => {
    const session = await renderSenderSession();
    const peerConn = createFakePeerConnection('receiver-1');
    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    });

    act(() => {
      session.connection.handlers.onIncomingConnection?.(peerConn, { shareKey: session.result.current.state.shareKey });
    });

    expect(session.engines).toHaveLength(1);
    expect(session.engines[0].conn).toBe(peerConn);
    expect(session.engines[0].start).toHaveBeenCalledWith([expect.objectContaining({ name: 'hello.txt' })], '');
    expect(session.result.current.state.pendingPeerId).toBeNull();
    expect(session.result.current.state.status).toBe('awaiting_receiver');
  });

  it('asks for approval when the link key is wrong', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    });

    act(() => {
      session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('receiver-1'), { shareKey: 'guessed' });
    });

    expect(session.engines).toHaveLength(0);
    expect(session.result.current.state.pendingPeerId).toBe('receiver-1');
    expect(session.result.current.state.isPendingPeerTrusted).toBe(false);
  });

  it('holds a link receiver until files are queued, then offers them', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('receiver-1'), {
        shareKey: session.result.current.state.shareKey,
      });
    });
    expect(session.engines).toHaveLength(0);
    expect(session.result.current.state.isPendingPeerTrusted).toBe(true);

    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    });

    expect(session.engines).toHaveLength(1);
    expect(session.engines[0].start).toHaveBeenCalledWith([expect.objectContaining({ name: 'hello.txt' })], '');
    expect(session.result.current.state.status).toBe('awaiting_receiver');
  });

  it('offers added and removed files to a receiver that is still choosing', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      result.current.actions.addFiles([new File(['more'], 'more.txt')]);
    });
    expect(engine.updateFiles).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'hello.txt' }),
      expect.objectContaining({ name: 'more.txt' }),
    ]);

    act(() => {
      result.current.actions.removeFile(result.current.state.files[0].id);
    });
    expect(engine.updateFiles).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'more.txt' })]);
  });

  it('empties the offer instead of dropping a receiver that is still choosing', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      result.current.actions.clearFiles();
    });

    expect(engine.updateFiles).toHaveBeenLastCalledWith([]);
    expect(connection.disconnectPeer).not.toHaveBeenCalled();
    expect(result.current.state.files).toEqual([]);
    expect(result.current.state.status).toBe('awaiting_receiver');
  });

  it('goes back to waiting, without an error, when the receiver leaves before downloading', async () => {
    const { engine, peerConn, result } = await startTransfer();

    act(() => {
      (peerConn as { open: boolean }).open = false;
      engine.events.onError?.('Connection to peer lost');
    });

    expect(result.current.state.status).toBe('waiting');
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.connectedPeerId).toBeNull();
  });

  it('still reports errors raised before the download while the receiver is connected', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      engine.events.onError?.('Too many incorrect PIN attempts');
    });

    expect(result.current.state.status).toBe('failed');
    expect(result.current.state.error).toBe('Too many incorrect PIN attempts');
  });

  it('queues each file only once, even when it is added again', async () => {
    const { result } = await renderSenderSession();
    const report = new File(['v1'], 'report.pdf', { lastModified: 1000 });

    act(() => {
      result.current.actions.addFiles([report]);
    });
    act(() => {
      result.current.actions.addFiles([new File(['v1'], 'report.pdf', { lastModified: 1000 }), new File(['x'], 'new.txt')]);
    });

    expect(result.current.state.files.map((file) => file.name)).toEqual(['report.pdf', 'new.txt']);
  });

  it('moves to a new room after repeated PIN lockouts, so guessing cannot go on', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.result.current.actions.addFiles([new File(['x'], 'x.txt')]);
      session.result.current.actions.setPin('1234');
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      act(() => {
        session.connection.handlers.onIncomingConnection?.(createFakePeerConnection(`guesser-${attempt}`), typedCode);
      });
      act(() => {
        session.result.current.actions.approvePeer();
      });
      act(() => {
        session.engines[attempt].events.onPinLockout?.();
        session.engines[attempt].events.onError?.('Too many incorrect PIN attempts');
      });
      if (attempt < 2) {
        expect(session.connections).toHaveLength(1);
        act(() => {
          session.result.current.actions.dismissError();
        });
      }
    }

    await waitFor(() => expect(session.connections).toHaveLength(2));
    // Never the remembered room: the point is that the old code stops working
    expect(session.connections[1].initSender).toHaveBeenCalledWith(settings, { preferredRoomId: undefined });
    expect(session.connections[0].destroy).toHaveBeenCalled();
    expect(session.result.current.state.status).toBe('waiting');
    expect(session.result.current.state.roomNotice).toMatch(/new room/i);
  });

  it('uses a fresh link key for every new room', async () => {
    const first = await renderSenderSession();
    sessionStorage.clear();
    const second = await renderSenderSession();

    expect(first.result.current.state.shareKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second.result.current.state.shareKey).not.toBe(first.result.current.state.shareKey);
  });

  it('reopens the previous room and link key after a reload, so shared links keep working', async () => {
    sessionStorage.setItem(SENDER_ROOM_STORAGE_KEY, JSON.stringify({ roomCode: 'DW-ROOM22', shareKey: 'kept-key' }));

    const { connection, result } = await renderSenderSession();

    expect(connection.initSender).toHaveBeenCalledWith(settings, { preferredRoomId: 'DW-ROOM22' });
    expect(result.current.state.shareKey).toBe('kept-key');
  });

  it('forgets the old link key when the previous room could not be reopened', async () => {
    sessionStorage.setItem(SENDER_ROOM_STORAGE_KEY, JSON.stringify({ roomCode: 'DW-GONE22', shareKey: 'old-key' }));

    const { result } = await renderSenderSession();

    expect(result.current.state.shareKey).not.toBe('old-key');
    expect(JSON.parse(sessionStorage.getItem(SENDER_ROOM_STORAGE_KEY) ?? '{}')).toEqual({
      roomCode: 'DW-ROOM22',
      shareKey: result.current.state.shareKey,
    });
  });
});
