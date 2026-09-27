import { vi } from 'vitest';
import type { DataConnection } from 'peerjs';
import type { ReceiverEvents, TransferEvents } from '../../types/transfer';
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

/** Stands in for TransferSender / TransferReceiver; tests fire `events` to simulate the protocol. */
export class FakeTransfer<Events extends TransferEvents = ReceiverEvents> {
  public conn: DataConnection;
  public events: Events;
  public start = vi.fn();
  public startReceiving = vi.fn().mockResolvedValue(true);
  public submitPin = vi.fn();
  public togglePause = vi.fn().mockReturnValue(true);
  public cancel = vi.fn();

  constructor(conn: DataConnection, events: Events) {
    this.conn = conn;
    this.events = events;
  }
}

export function createFakePeerConnection(peer: string): DataConnection {
  return { peer, open: true, close: vi.fn() } as unknown as DataConnection;
}

/** Session services whose connections and transfers are recorded so tests can drive their events. */
export function createFakeServices() {
  const connections: FakeConnection[] = [];
  const engines: FakeTransfer[] = [];
  const effects = { onTransferStarted: vi.fn(), onTransferEnded: vi.fn() };
  const services: SessionServices = {
    createConnection: (handlers) => {
      const connection = new FakeConnection(handlers);
      connections.push(connection);
      return connection;
    },
    createSender: (conn, events) => {
      const engine = new FakeTransfer<ReceiverEvents>(conn, events);
      engines.push(engine);
      return engine;
    },
    createReceiver: (conn, events) => {
      const engine = new FakeTransfer<ReceiverEvents>(conn, events);
      engines.push(engine);
      return engine;
    },
    effects,
  };
  return { services, connections, engines, effects };
}
