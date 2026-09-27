import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebRtcService } from '../services/webrtc';

// Hoisted so the vi.mock factory below can reference the fakes
const { FakeConnection, FakePeer, peers, peerBehavior } = vi.hoisted(() => {
  type Handler = (...args: any[]) => void;

  class FakeEmitter {
    private handlers: Record<string, Handler[]> = {};
    public on(event: string, handler: Handler) {
      (this.handlers[event] ??= []).push(handler);
    }
    public off(event: string, handler: Handler) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((registered) => registered !== handler);
    }
    public emit(event: string, ...args: any[]) {
      for (const handler of this.handlers[event] ?? []) {
        handler(...args);
      }
    }
  }

  class FakeConnection extends FakeEmitter {
    public open = true;
    public close = vi.fn(() => {
      this.open = false;
      this.emit('close');
    });
    public peer: string;
    constructor(peer: string) {
      super();
      this.peer = peer;
    }
  }

  const peers: FakePeer[] = [];
  // openError: every new peer fails with it; takenIds: those room IDs are already in use;
  // isConnectionStalled: outgoing connections never open (e.g. ICE cannot find a route)
  const peerBehavior: { openError: { type: string } | null; takenIds: Set<string>; isConnectionStalled: boolean } = {
    openError: null,
    takenIds: new Set(),
    isConnectionStalled: false,
  };

  class FakePeer extends FakeEmitter {
    public id: string;
    public destroy = vi.fn();
    public connect = vi.fn((targetId: string) => {
      const conn = new FakeConnection(targetId);
      conn.open = !peerBehavior.isConnectionStalled;
      return conn;
    });
    constructor(id?: string) {
      super();
      this.id = id ?? 'ephemeral';
      peers.push(this);
      const openError = peerBehavior.takenIds.has(this.id) ? { type: 'unavailable-id' } : peerBehavior.openError;
      queueMicrotask(() => (openError ? this.emit('error', openError) : this.emit('open', this.id)));
    }
  }

  return { FakeConnection, FakePeer, peers, peerBehavior };
});

vi.mock('peerjs', () => ({ default: FakePeer }));

describe('WebRtcService.generateRoomId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces a DW- code from the unambiguous alphabet', () => {
    const id = new WebRtcService().generateRoomId();

    expect(id).toMatch(/^DW-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  });

  it('uses the room-code prefix of the active brand', () => {
    document.documentElement.dataset.brand = 'dropto';
    try {
      expect(new WebRtcService().generateRoomId()).toMatch(/^DT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    } finally {
      delete document.documentElement.dataset.brand;
    }
  });

  // Room codes are the only barrier to a stranger requesting files, so they must not be predictable
  it('draws room codes from the cryptographic RNG, not Math.random', () => {
    const cryptoSpy = vi.spyOn(crypto, 'getRandomValues');
    const mathSpy = vi.spyOn(Math, 'random');

    new WebRtcService().generateRoomId();

    expect(cryptoSpy).toHaveBeenCalled();
    expect(mathSpy).not.toHaveBeenCalled();
  });
});

/** A receiver connecting to the room and sending its first protocol message. */
function connectReceiver(peer: InstanceType<typeof FakePeer>, peerId: string, shareKey: string | null = null) {
  const conn = new FakeConnection(peerId);
  peer.emit('connection', conn);
  conn.emit('data', JSON.stringify({ type: 'HELLO', payload: { shareKey } }));
  return conn;
}

describe('WebRtcService incoming connections', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function startSender() {
    const incoming: string[] = [];
    const greetings: (string | null)[] = [];
    const service = new WebRtcService({
      onIncomingConnection: (conn, greeting) => {
        incoming.push(conn.peer);
        greetings.push(greeting.shareKey);
      },
    });
    await service.initSender();
    return { service, incoming, greetings, peer: peers[peers.length - 1] };
  }

  it('announces a receiver together with the share key from its greeting', async () => {
    const { incoming, greetings, peer } = await startSender();

    connectReceiver(peer, 'receiver-1', 'link-key');

    expect(incoming).toEqual(['receiver-1']);
    expect(greetings).toEqual(['link-key']);
  });

  it('waits for the greeting before announcing a receiver', async () => {
    const { incoming, peer } = await startSender();

    peer.emit('connection', new FakeConnection('receiver-1'));

    expect(incoming).toEqual([]);
  });

  it('treats a receiver that never greets as having no key', async () => {
    vi.useFakeTimers();
    const { incoming, greetings, peer } = await startSender();

    peer.emit('connection', new FakeConnection('old-client'));
    vi.advanceTimersByTime(5_000);

    expect(incoming).toEqual(['old-client']);
    expect(greetings).toEqual([null]);
  });

  it('announces a silent receiver only once its connection has actually opened', async () => {
    vi.useFakeTimers();
    const { incoming, greetings, peer } = await startSender();
    const conn = new FakeConnection('slow-receiver');
    conn.open = false;

    peer.emit('connection', conn);
    vi.advanceTimersByTime(10_000);
    expect(incoming).toEqual([]);

    conn.open = true;
    conn.emit('open');
    vi.advanceTimersByTime(5_000);
    expect(incoming).toEqual(['slow-receiver']);
    expect(greetings).toEqual([null]);
  });

  it('announces each receiver only once', async () => {
    const { incoming, peer } = await startSender();
    const conn = connectReceiver(peer, 'receiver-1', 'link-key');

    conn.emit('data', JSON.stringify({ type: 'HELLO', payload: { shareKey: 'again' } }));

    expect(incoming).toEqual(['receiver-1']);
  });

  it('reports which receiver disconnected', async () => {
    const disconnected: (string | undefined)[] = [];
    const service = new WebRtcService({
      onDisconnected: (peerId) => {
        disconnected.push(peerId);
      },
    });
    await service.initSender();
    const conn = new FakeConnection('receiver-1');
    peers[peers.length - 1].emit('connection', conn);

    conn.close();

    expect(disconnected).toEqual(['receiver-1']);
  });

  it('disconnects one receiver and leaves the others connected', async () => {
    const { service, peer } = await startSender();
    const first = connectReceiver(peer, 'receiver-1');
    const second = connectReceiver(peer, 'receiver-2');

    service.disconnectPeer('receiver-1');

    // flush: messages sent just before (e.g. TRANSFER_CANCEL) must still reach the peer
    expect(first.close).toHaveBeenCalledWith({ flush: true });
    expect(second.close).not.toHaveBeenCalled();
  });

  it('announces several receivers at once; whether they may stay is up to the session', async () => {
    const { incoming, peer } = await startSender();
    const first = connectReceiver(peer, 'receiver-1');
    const second = connectReceiver(peer, 'receiver-2');

    expect(incoming).toEqual(['receiver-1', 'receiver-2']);
    expect(first.close).not.toHaveBeenCalled();
    expect(second.close).not.toHaveBeenCalled();
  });

  it('accepts a new receiver once the previous one disconnected', async () => {
    const { incoming, peer } = await startSender();
    const first = connectReceiver(peer, 'receiver-1');

    first.close();
    connectReceiver(peer, 'receiver-2');

    expect(incoming).toEqual(['receiver-1', 'receiver-2']);
  });
});

describe('WebRtcService room creation', () => {
  afterEach(() => {
    peerBehavior.openError = null;
    peerBehavior.takenIds.clear();
  });

  it('reopens the preferred room code, so links survive a sender reload', async () => {
    const roomCode = await new WebRtcService().initSender(undefined, { preferredRoomId: 'DW-KEEP22' });

    expect(roomCode).toBe('DW-KEEP22');
  });

  it('falls back to a fresh room code when the preferred one is taken', async () => {
    peerBehavior.takenIds.add('DW-KEEP22');

    const roomCode = await new WebRtcService().initSender(undefined, { preferredRoomId: 'DW-KEEP22' });

    expect(roomCode).not.toBe('DW-KEEP22');
    expect(roomCode).toMatch(/^DW-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  });

  it('gives up after a few room-code collisions instead of retrying forever', async () => {
    peerBehavior.openError = { type: 'unavailable-id' };
    const peersBefore = peers.length;

    await expect(new WebRtcService().initSender()).rejects.toBeDefined();

    const attempts = peers.length - peersBefore;
    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThanOrEqual(5);
  });
});

describe('WebRtcService connecting to a room', () => {
  afterEach(() => {
    peerBehavior.isConnectionStalled = false;
    vi.useRealTimers();
  });

  it('connects to the room', async () => {
    const conn = await new WebRtcService().initReceiver('DW-ROOM22');

    expect(conn.peer).toBe('DW-ROOM22');
  });

  it('gives up when the connection never opens, instead of spinning forever', async () => {
    vi.useFakeTimers();
    peerBehavior.isConnectionStalled = true;
    const connecting = new WebRtcService().initReceiver('DW-ROOM22');
    const outcome = connecting.catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(await outcome).toMatchObject({ type: 'connection-timeout' });
  });
});
