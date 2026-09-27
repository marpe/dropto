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
  // When set, new peers fail to open with this PeerJS error instead of opening
  const peerBehavior: { openError: { type: string } | null } = { openError: null };

  class FakePeer extends FakeEmitter {
    public id: string;
    public destroy = vi.fn();
    constructor(id?: string) {
      super();
      this.id = id ?? 'ephemeral';
      peers.push(this);
      const openError = peerBehavior.openError;
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

describe('WebRtcService incoming connections', () => {
  async function startSender() {
    const incoming: string[] = [];
    const service = new WebRtcService({
      onIncomingConnection: (conn) => {
        incoming.push(conn.peer);
      },
    });
    await service.initSender();
    return { service, incoming, peer: peers[peers.length - 1] };
  }

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

  it('frees the room for the next receiver after disconnecting the current peer', async () => {
    const { service, incoming, peer } = await startSender();
    const first = new FakeConnection('receiver-1');
    peer.emit('connection', first);

    service.disconnectPeer();
    peer.emit('connection', new FakeConnection('receiver-2'));

    // flush: messages sent just before (e.g. TRANSFER_CANCEL) must still reach the peer
    expect(first.close).toHaveBeenCalledWith({ flush: true });
    expect(incoming).toEqual(['receiver-1', 'receiver-2']);
  });

  it('turns away a second receiver while the first is still connected', async () => {
    const { incoming, peer } = await startSender();
    const first = new FakeConnection('receiver-1');
    const second = new FakeConnection('receiver-2');

    peer.emit('connection', first);
    peer.emit('connection', second);

    expect(incoming).toEqual(['receiver-1']);
    expect(second.close).toHaveBeenCalled();
    expect(first.close).not.toHaveBeenCalled();
  });

  it('accepts a new receiver once the previous one disconnected', async () => {
    const { incoming, peer } = await startSender();
    const first = new FakeConnection('receiver-1');
    peer.emit('connection', first);

    first.close();
    peer.emit('connection', new FakeConnection('receiver-2'));

    expect(incoming).toEqual(['receiver-1', 'receiver-2']);
  });
});

describe('WebRtcService room creation', () => {
  afterEach(() => {
    peerBehavior.openError = null;
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
