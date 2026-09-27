import { vi } from 'vitest';
import type { DataConnection } from 'peerjs';
import type { EngineEventCallback } from '../../services/transferEngine';
import type { ConnectionEventHandler } from '../../services/webrtc';
import type { SessionServices } from '../../hooks/sessionServices';

export class FakeConnection {
  public handlers: ConnectionEventHandler;
  public initSender = vi.fn().mockResolvedValue('DW-ROOM22');
  public initReceiver = vi.fn().mockResolvedValue(createFakePeerConnection('sender'));
  public disconnectPeer = vi.fn();
  public destroy = vi.fn();

  constructor(handlers: ConnectionEventHandler) {
    this.handlers = handlers;
  }
}

export class FakeEngine {
  public callbacks: EngineEventCallback = {};
  public init = vi.fn((_conn: DataConnection, _isSender: boolean, callbacks: EngineEventCallback) => {
    this.callbacks = callbacks;
  });
  public startSenderTransfer = vi.fn().mockResolvedValue(undefined);
  public startReceiving = vi.fn().mockResolvedValue(true);
  public togglePause = vi.fn().mockReturnValue(true);
  public cancel = vi.fn();
}

export function createFakePeerConnection(peer: string): DataConnection {
  return { peer, open: true, close: vi.fn() } as unknown as DataConnection;
}

/** Session services whose connections and engines are recorded so tests can drive their events. */
export function createFakeServices() {
  const connections: FakeConnection[] = [];
  const engines: FakeEngine[] = [];
  const services: SessionServices = {
    createConnection: (handlers) => {
      const connection = new FakeConnection(handlers);
      connections.push(connection);
      return connection;
    },
    createEngine: () => {
      const engine = new FakeEngine();
      engines.push(engine);
      return engine as unknown as ReturnType<SessionServices['createEngine']>;
    },
  };
  return { services, connections, engines };
}
