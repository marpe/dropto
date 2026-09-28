import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DataConnection } from 'peerjs';
import { useSenderSession } from '../hooks/useSenderSession';
import { BUSY_MESSAGE, LINK_USED_MESSAGE } from '../hooks/senderRoom';
import type { AppSettings } from '../types/transfer';
import type { ReceiverGreeting } from '../services/webrtc';
import { SENDER_ROOM_STORAGE_KEY } from '../utils/roomMemory';
import { MAX_SIMULTANEOUS_STORAGE_KEY } from '../utils/sharingMemory';
import {
  createFakePeerConnection,
  createFakeServices,
  FakeConnection,
  sentMessages,
} from './utils/fakeSessionServices';

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
};

type Session = Awaited<ReturnType<typeof renderSenderSession>>;

async function renderSenderSession() {
  const fakes = createFakeServices();
  const hook = renderHook(({ active }) => useSenderSession({ active, settings, services: fakes.services }), {
    initialProps: { active: true },
  });
  await waitFor(() => expect(hook.result.current.state.roomCode).toBe('DW-ROOM22'));
  return { ...fakes, ...hook, connection: fakes.connections[0] };
}

function connectPeer(session: Session, peerId: string, greeting: ReceiverGreeting = typedCode) {
  const conn = createFakePeerConnection(peerId);
  act(() => {
    session.connection.handlers.onIncomingConnection?.(conn, greeting);
  });
  return conn;
}

const linkGreeting = (session: Session) => ({ shareKey: session.result.current.state.shareKey });

/** Queues a file, lets a receiver connect and approves it. */
async function startTransfer() {
  const session = await renderSenderSession();
  act(() => {
    session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
  });
  const peerConn = connectPeer(session, 'receiver-1');
  act(() => {
    session.result.current.actions.approvePeer('receiver-1');
  });
  return { ...session, peerConn, engine: session.engines[0] };
}

/** Queues a file and creates the link with the given options. */
async function shareWith(options: Parameters<ReturnType<typeof useSenderSession>['actions']['setSharingOptions']>[0]) {
  const session = await renderSenderSession();
  act(() => {
    session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    session.result.current.actions.setSharingOptions(options);
  });
  act(() => {
    session.result.current.actions.createLink();
  });
  return session;
}

it('asks for notification permission when the link is created, inside the click', async () => {
  const session = await shareWith({});

  expect(session.effects.onTransferRequested).toHaveBeenCalledTimes(1);
});

const stages = (session: Session) => session.result.current.state.receivers.map((receiver) => receiver.stage);

function lastQueuedPosition(conn: DataConnection) {
  return sentMessages(conn)
    .filter((message) => message.type === 'QUEUED')
    .at(-1)?.payload?.position;
}

describe('useSenderSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('opens a room when active and exposes its code', async () => {
    const { connection, result } = await renderSenderSession();

    expect(connection.initSender).toHaveBeenCalledWith(settings, { preferredRoomId: undefined });
    expect(result.current.status).toBe('waiting');
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
    await waitFor(() => expect(result.current.state.roomError).toBe('Server unreachable'));
    expect(result.current.state.roomCode).toBe('');

    await act(async () => {
      await result.current.actions.retryRoom();
    });

    expect(fakes.connections).toHaveLength(2);
    expect(fakes.connections[0].destroy).toHaveBeenCalled();
    expect(result.current.state.roomCode).toBe('DW-ROOM22');
    expect(result.current.state.roomError).toBeNull();
  });

  it('asks for approval when a receiver connects and streams the queued files once approved', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
      session.result.current.actions.setSharingOptions({ pin: '4321' });
    });

    const peerConn = connectPeer(session, 'receiver-1');
    expect(session.result.current.state.pendingPeers).toMatchObject([{ peerId: 'receiver-1', isTrusted: false }]);

    act(() => {
      session.result.current.actions.approvePeer('receiver-1');
    });

    const engine = session.engines[0];
    expect(engine.conn).toBe(peerConn);
    expect(engine.start).toHaveBeenCalledWith([expect.objectContaining({ name: 'hello.txt', size: 5 })], '4321');
    // The receiver is now choosing where to save; nothing streams until it asks
    expect(session.result.current.status).toBe('awaiting_receiver');
    expect(session.result.current.state.pendingPeers).toEqual([]);
    expect(session.result.current.focus?.peerId).toBe('receiver-1');
  });

  it('does not start a transfer when a receiver is accepted with nothing queued', async () => {
    const session = await renderSenderSession();
    connectPeer(session, 'receiver-1');

    act(() => {
      session.result.current.actions.approvePeer('receiver-1');
    });

    expect(session.engines).toHaveLength(0);
    expect(session.result.current.status).toBe('waiting');
    expect(session.result.current.state.pendingPeers.map((peer) => peer.peerId)).toEqual(['receiver-1']);
  });

  it('closes a rejected receiver without starting a transfer', async () => {
    const session = await renderSenderSession();
    const peerConn = connectPeer(session, 'receiver-1');

    act(() => {
      session.result.current.actions.rejectPeer('receiver-1');
    });

    expect(peerConn.close).toHaveBeenCalled();
    expect(session.engines).toHaveLength(0);
    expect(session.result.current.state.pendingPeers).toEqual([]);
  });

  it('drops the approval request when the receiver leaves before it is answered', async () => {
    const session = await renderSenderSession();
    connectPeer(session, 'receiver-1');

    act(() => {
      session.connection.handlers.onDisconnected?.();
    });

    expect(session.result.current.state.pendingPeers).toEqual([]);
  });

  it('keeps a newer approval request when an earlier receiver closes late', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    });
    connectPeer(session, 'receiver-2');

    act(() => {
      session.connection.handlers.onDisconnected?.('receiver-1');
    });

    expect(session.result.current.state.pendingPeers.map((peer) => peer.peerId)).toEqual(['receiver-2']);
    act(() => {
      session.result.current.actions.approvePeer('receiver-2');
    });
    expect(session.engines).toHaveLength(1);
  });

  it('shows completion together with any corrupted files', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      engine.events.onAllCompleted?.({ corruptedFiles: ['hello.txt'] });
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.focus?.corruptedFiles).toEqual(['hello.txt']);
  });

  it('shows a failed transfer and frees the room for the next receiver', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      engine.events.onError?.('Connection to peer lost');
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.focus?.error).toBe('Connection to peer lost');
    expect(connection.disconnectPeer).toHaveBeenCalledWith('receiver-1');

    act(() => {
      result.current.actions.dismissError();
    });
    expect(result.current.status).toBe('waiting');
    expect(result.current.focus).toBeNull();
  });

  it('returns to waiting when the receiver cancels', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      engine.events.onCancelled?.();
    });

    expect(result.current.status).toBe('waiting');
    expect(result.current.focus).toBeNull();
    expect(connection.disconnectPeer).toHaveBeenCalledWith('receiver-1');
  });

  it('cancels through the engine and frees the room', async () => {
    const { engine, connection, result } = await startTransfer();

    act(() => {
      result.current.actions.cancel();
    });

    expect(engine.cancel).toHaveBeenCalled();
    expect(connection.disconnectPeer).toHaveBeenCalledWith('receiver-1');
    expect(result.current.status).toBe('waiting');
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
    expect(result.current.focus?.isPaused).toBe(true);
  });

  it('closes the room when deactivated and ignores late events from the old session', async () => {
    const { engine, connection, result, rerender } = await startTransfer();

    rerender({ active: false });
    act(() => {
      engine.events.onError?.('Connection to peer lost');
    });

    expect(connection.destroy).toHaveBeenCalled();
    expect(result.current.state.roomCode).toBe('');
    expect(result.current.focus).toBeNull();
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
    expect(result.current.status).toBe('waiting');
    expect(connection.disconnectPeer).toHaveBeenCalled();
  });

  it('shows the transfer once the receiver starts downloading, with the files it chose', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      engine.events.onReceiverStarted?.([0]);
    });

    expect(result.current.status).toBe('transferring');
    expect(result.current.focus?.fileIndices).toEqual([0]);
  });

  it('admits a receiver holding the link key without asking', async () => {
    const session = await shareWith({});

    const peerConn = connectPeer(session, 'receiver-1', linkGreeting(session));

    expect(session.engines).toHaveLength(1);
    expect(session.engines[0].conn).toBe(peerConn);
    expect(session.engines[0].start).toHaveBeenCalledWith([expect.objectContaining({ name: 'hello.txt' })], '');
    expect(session.result.current.state.pendingPeers).toEqual([]);
    expect(session.result.current.status).toBe('awaiting_receiver');
  });

  it('asks for approval when the link key is wrong', async () => {
    const session = await renderSenderSession();
    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    });

    connectPeer(session, 'receiver-1', { shareKey: 'guessed' });

    expect(session.engines).toHaveLength(0);
    expect(session.result.current.state.pendingPeers).toMatchObject([{ peerId: 'receiver-1', isTrusted: false }]);
  });

  it('holds a link receiver until files are queued and the link is created, then offers them', async () => {
    const session = await renderSenderSession();
    connectPeer(session, 'receiver-1', linkGreeting(session));
    expect(session.engines).toHaveLength(0);
    expect(session.result.current.state.pendingPeers).toMatchObject([{ peerId: 'receiver-1', isTrusted: true }]);

    act(() => {
      session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
    });
    expect(session.engines).toHaveLength(0);

    act(() => {
      session.result.current.actions.createLink();
    });

    expect(session.engines).toHaveLength(1);
    expect(session.engines[0].start).toHaveBeenCalledWith([expect.objectContaining({ name: 'hello.txt' })], '');
    expect(session.result.current.status).toBe('awaiting_receiver');
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
    expect(result.current.status).toBe('awaiting_receiver');
  });

  it('goes back to waiting, without an error, when the receiver leaves before downloading', async () => {
    const { engine, peerConn, result } = await startTransfer();

    act(() => {
      (peerConn as { open: boolean }).open = false;
      engine.events.onError?.('Connection to peer lost');
    });

    expect(result.current.status).toBe('waiting');
    expect(result.current.focus).toBeNull();
  });

  it('still reports errors raised before the download while the receiver is connected', async () => {
    const { engine, result } = await startTransfer();

    act(() => {
      engine.events.onError?.('Too many incorrect PIN attempts');
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.focus?.error).toBe('Too many incorrect PIN attempts');
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
      session.result.current.actions.setSharingOptions({ pin: '1234' });
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      connectPeer(session, `guesser-${attempt}`);
      act(() => {
        session.result.current.actions.approvePeer(`guesser-${attempt}`);
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
    expect(session.result.current.status).toBe('waiting');
    expect(session.result.current.state.roomNotice).toMatch(/link changed/i);
  });

  describe('sharing', () => {
    it('keeps link receivers waiting until the sender creates the link', async () => {
      const session = await renderSenderSession();
      act(() => {
        session.result.current.actions.addFiles([new File(['hello'], 'hello.txt')]);
      });
      connectPeer(session, 'early', linkGreeting(session));
      expect(session.result.current.state.isShared).toBe(false);
      expect(session.engines).toHaveLength(0);

      act(() => {
        session.result.current.actions.createLink();
      });

      expect(session.result.current.state.isShared).toBe(true);
      expect(session.engines).toHaveLength(1);
    });

    it('asks before admitting link receivers when approval is required', async () => {
      const session = await shareWith({ requireApproval: true });

      connectPeer(session, 'receiver-1', linkGreeting(session));

      expect(session.engines).toHaveLength(0);
      expect(session.result.current.state.pendingPeers).toMatchObject([{ peerId: 'receiver-1', isTrusted: false }]);
    });

    it('applies changed settings to new connections only, unless told to stop current transfers', async () => {
      const { engine, result } = await startTransfer();
      const options = result.current.state.options;

      act(() => {
        result.current.actions.updateSharing({ ...options, pin: '9999' }, 'new');
      });
      expect(engine.cancel).not.toHaveBeenCalled();
      expect(result.current.state.options.pin).toBe('9999');
      expect(result.current.status).toBe('awaiting_receiver');

      act(() => {
        result.current.actions.updateSharing({ ...options, pin: '1111', requireApproval: true }, 'now');
      });
      expect(engine.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('waiting');
      expect(result.current.state.options.requireApproval).toBe(true);
    });

    it('gives new connections the current PIN', async () => {
      const session = await shareWith({});
      act(() => {
        session.result.current.actions.updateSharing({ ...session.result.current.state.options, pin: '4242' }, 'new');
      });

      connectPeer(session, 'receiver-1', linkGreeting(session));

      expect(session.engines[0].start).toHaveBeenCalledWith(expect.any(Array), '4242');
    });

    it('starts the next batch with a fresh link, so earlier recipients cannot join it', async () => {
      const session = await shareWith({});
      const firstKey = session.result.current.state.shareKey;

      act(() => {
        session.result.current.actions.clearFiles();
      });

      await waitFor(() => expect(session.connections).toHaveLength(2));
      expect(session.connections[1].initSender).toHaveBeenCalledWith(settings, { preferredRoomId: undefined });
      await waitFor(() => expect(session.result.current.state.shareKey).not.toBe(''));
      expect(session.result.current.state.shareKey).not.toBe(firstKey);
      expect(session.result.current.state.isShared).toBe(false);
    });

    it('stops sharing without losing the files, so the same files can go out on a new link', async () => {
      const session = await shareWith({});
      const receiverConn = connectPeer(session, 'receiver-1', linkGreeting(session));

      act(() => {
        session.result.current.actions.stopSharing();
      });

      expect(session.engines[0].cancel).toHaveBeenCalled();
      expect(receiverConn).toBeDefined();
      await waitFor(() => expect(session.connections).toHaveLength(2));
      expect(session.connections[1].initSender).toHaveBeenCalledWith(settings, { preferredRoomId: undefined });
      expect(session.result.current.state.files).toHaveLength(1);
      expect(session.result.current.state.isShared).toBe(false);
      expect(session.result.current.state.receivers).toEqual([]);
    });
  });

  describe('with one person at a time', () => {
    it('turns away a second person, with the reason, while the link is in use', async () => {
      const session = await shareWith({});
      connectPeer(session, 'receiver-1', linkGreeting(session));

      const second = connectPeer(session, 'receiver-2', linkGreeting(session));

      expect(session.engines).toHaveLength(1);
      expect(sentMessages(second)).toEqual([{ type: 'ERROR', payload: { message: BUSY_MESSAGE } }]);
      expect(session.connection.disconnectPeer).toHaveBeenCalledWith('receiver-2');
    });

    it('stops admitting anyone once the files have been downloaded', async () => {
      const session = await shareWith({});
      connectPeer(session, 'receiver-1', linkGreeting(session));
      act(() => {
        session.engines[0].events.onAllCompleted?.({ corruptedFiles: [] });
      });

      const late = connectPeer(session, 'receiver-2', linkGreeting(session));

      expect(session.engines).toHaveLength(1);
      expect(sentMessages(late)).toEqual([{ type: 'ERROR', payload: { message: LINK_USED_MESSAGE } }]);
    });

    it('lets the person try again after a failed download', async () => {
      const session = await shareWith({});
      connectPeer(session, 'receiver-1', linkGreeting(session));
      act(() => {
        session.engines[0].events.onError?.('Disk full');
      });

      connectPeer(session, 'receiver-1-again', linkGreeting(session));

      expect(session.engines).toHaveLength(2);
      expect(session.result.current.focus?.peerId).toBe('receiver-1-again');
      expect(stages(session)).toEqual(['choosing']);
    });
  });

  describe('with several people', () => {
    async function shareWithSeveral(maxSimultaneous = 2) {
      return shareWith({ allowMultiple: true, maxSimultaneous });
    }

    it('lets people download at the same time up to the limit, and lines up the rest', async () => {
      const session = await shareWithSeveral(2);

      connectPeer(session, 'p1', linkGreeting(session));
      connectPeer(session, 'p2', linkGreeting(session));
      const third = connectPeer(session, 'p3', linkGreeting(session));

      expect(session.engines).toHaveLength(2);
      expect(stages(session)).toEqual(['choosing', 'choosing', 'queued']);
      expect(lastQueuedPosition(third)).toBe(1);
      // Nobody is shown full screen: the link and the list of people stay on screen
      expect(session.result.current.focus).toBeNull();
      expect(session.result.current.status).toBe('waiting');
    });

    it('starts the next person in line when a download finishes', async () => {
      const session = await shareWithSeveral(2);
      connectPeer(session, 'p1', linkGreeting(session));
      connectPeer(session, 'p2', linkGreeting(session));
      const third = connectPeer(session, 'p3', linkGreeting(session));

      act(() => {
        session.engines[0].events.onAllCompleted?.({ corruptedFiles: [] });
      });

      expect(session.engines).toHaveLength(3);
      expect(session.engines[2].conn).toBe(third);
      expect(stages(session)).toEqual(['completed', 'choosing', 'choosing']);
    });

    it('keeps admitting people after someone has finished', async () => {
      const session = await shareWithSeveral(2);
      connectPeer(session, 'p1', linkGreeting(session));
      act(() => {
        session.engines[0].events.onAllCompleted?.({ corruptedFiles: [] });
      });

      connectPeer(session, 'p2', linkGreeting(session));

      expect(session.engines).toHaveLength(2);
    });

    it('starts people waiting in line when the limit is raised', async () => {
      const session = await shareWithSeveral(1);
      connectPeer(session, 'p1', linkGreeting(session));
      connectPeer(session, 'p2', linkGreeting(session));
      expect(session.engines).toHaveLength(1);

      act(() => {
        session.result.current.actions.updateSharing({ ...session.result.current.state.options, maxSimultaneous: 2 }, 'new');
      });

      expect(session.engines).toHaveLength(2);
    });

    it('never interrupts downloads when the limit is lowered', async () => {
      const session = await shareWithSeveral(2);
      connectPeer(session, 'p1', linkGreeting(session));
      connectPeer(session, 'p2', linkGreeting(session));

      act(() => {
        session.result.current.actions.updateSharing({ ...session.result.current.state.options, maxSimultaneous: 1 }, 'new');
      });
      const third = connectPeer(session, 'p3', linkGreeting(session));

      expect(session.engines.map((engine) => engine.cancel.mock.calls.length)).toEqual([0, 0]);
      expect(lastQueuedPosition(third)).toBe(1);
    });

    it('moves the line up when someone waiting leaves', async () => {
      const session = await shareWithSeveral(1);
      connectPeer(session, 'p1', linkGreeting(session));
      connectPeer(session, 'p2', linkGreeting(session));
      const last = connectPeer(session, 'p3', linkGreeting(session));
      expect(lastQueuedPosition(last)).toBe(2);

      act(() => {
        session.connection.handlers.onDisconnected?.('p2');
      });

      expect(lastQueuedPosition(last)).toBe(1);
      expect(stages(session)).toEqual(['choosing', 'queued']);
    });

    it('stops one person and leaves the others downloading', async () => {
      const session = await shareWithSeveral(2);
      connectPeer(session, 'p1', linkGreeting(session));
      connectPeer(session, 'p2', linkGreeting(session));

      act(() => {
        session.result.current.actions.stopReceiver('p1');
      });

      expect(session.engines[0].cancel).toHaveBeenCalled();
      expect(session.engines[1].cancel).not.toHaveBeenCalled();
      expect(session.result.current.state.receivers.map((receiver) => receiver.peerId)).toEqual(['p2']);
    });

    it('stops everyone, including people in line, when stricter settings apply now', async () => {
      const session = await shareWithSeveral(1);
      connectPeer(session, 'p1', linkGreeting(session));
      const waiting = connectPeer(session, 'p2', linkGreeting(session));

      act(() => {
        session.result.current.actions.updateSharing({ ...session.result.current.state.options, pin: '1234' }, 'now');
      });

      expect(session.engines).toHaveLength(1);
      expect(session.engines[0].cancel).toHaveBeenCalled();
      expect(sentMessages(waiting).at(-1)?.type).toBe('ERROR');
      expect(session.result.current.state.receivers).toEqual([]);
    });

    it('turns away people in line when sharing goes back to one person', async () => {
      const session = await shareWithSeveral(1);
      connectPeer(session, 'p1', linkGreeting(session));
      const waiting = connectPeer(session, 'p2', linkGreeting(session));

      act(() => {
        session.result.current.actions.updateSharing({ ...session.result.current.state.options, allowMultiple: false }, 'new');
      });

      expect(sentMessages(waiting).at(-1)).toEqual({ type: 'ERROR', payload: { message: BUSY_MESSAGE } });
      expect(session.engines[0].cancel).not.toHaveBeenCalled();
    });

    it('keeps the device awake until the last download ends', async () => {
      const session = await shareWithSeveral(2);
      connectPeer(session, 'p1', linkGreeting(session));
      connectPeer(session, 'p2', linkGreeting(session));

      act(() => {
        session.engines[0].events.onAllCompleted?.({ corruptedFiles: [] });
      });
      expect(session.effects.onTransferEnded).not.toHaveBeenCalled();

      act(() => {
        session.engines[1].events.onAllCompleted?.({ corruptedFiles: [] });
      });
      expect(session.effects.onTransferStarted).toHaveBeenCalledTimes(1);
      expect(session.effects.onTransferEnded).toHaveBeenCalledWith(true);
    });

    it('asks for approval instead of closing the room when PIN guessing starts while others download', async () => {
      const session = await shareWithSeveral(5);
      act(() => {
        session.result.current.actions.updateSharing({ ...session.result.current.state.options, pin: '1234' }, 'new');
      });
      connectPeer(session, 'downloader', linkGreeting(session));

      for (let attempt = 1; attempt <= 3; attempt++) {
        connectPeer(session, `guesser-${attempt}`, linkGreeting(session));
        act(() => {
          session.engines[attempt].events.onPinLockout?.();
          session.engines[attempt].events.onError?.('Too many incorrect PIN attempts');
        });
      }

      expect(session.connections).toHaveLength(1);
      expect(session.engines[0].cancel).not.toHaveBeenCalled();
      expect(session.result.current.state.options.requireApproval).toBe(true);
      expect(session.result.current.state.roomNotice).toMatch(/need your approval/i);
      connectPeer(session, 'guesser-4', linkGreeting(session));
      expect(session.result.current.state.pendingPeers).toMatchObject([{ peerId: 'guesser-4', isTrusted: false }]);
    });

    it('labels people with the device and place they introduced, then their address once known', async () => {
      const session = await shareWithSeveral(2);
      session.services.readAddress = async () => '203.0.113.7';

      act(() => {
        session.connection.handlers.onIncomingConnection?.(createFakePeerConnection('p1'), {
          ...linkGreeting(session),
          device: 'Chrome on Android',
          timeZone: 'Europe/Stockholm',
        });
      });
      expect(session.result.current.state.receivers[0].details).toEqual({
        device: 'Chrome on Android',
        timeZone: 'Europe/Stockholm',
        ip: null,
      });

      await waitFor(() => expect(session.result.current.state.receivers[0].details.ip).toBe('203.0.113.7'));
    });

    it('labels people waiting for approval too', async () => {
      const session = await shareWith({ requireApproval: true });

      connectPeer(session, 'asking', { shareKey: null, device: 'Safari on iPhone' });

      expect(session.result.current.state.pendingPeers[0].details.device).toBe('Safari on iPhone');
    });
  });

  it('remembers the download limit for next time', async () => {
    const first = await renderSenderSession();
    act(() => {
      first.result.current.actions.setSharingOptions({ maxSimultaneous: 5 });
    });
    expect(localStorage.getItem(MAX_SIMULTANEOUS_STORAGE_KEY)).toBe('5');

    const second = await renderSenderSession();

    expect(second.result.current.state.options.maxSimultaneous).toBe(5);
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
