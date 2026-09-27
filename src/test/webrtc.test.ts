import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebRtcService } from '../services/webrtc';

// Hoisted so the vi.mock factory below can reference the fakes
const { FakeConnection, FakePeer, peers } = vi.hoisted(() => {
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

  class FakePeer extends FakeEmitter {
    public id: string;
    public destroy = vi.fn();
    constructor(id?: string) {
      super();
      this.id = id ?? 'ephemeral';
      peers.push(this);
      queueMicrotask(() => this.emit('open', this.id));
    }
  }

  return { FakeConnection, FakePeer, peers };
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
    const service = new WebRtcService();
    const incoming: string[] = [];
    service.setHandlers({
      onIncomingConnection: (conn) => {
        incoming.push(conn.peer);
      },
    });
    await service.initSender();
    return { service, incoming, peer: peers[peers.length - 1] };
  }

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
