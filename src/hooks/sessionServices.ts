import type { DataConnection } from 'peerjs';
import { TransferReceiver } from '../services/transfer/receiver';
import type { ReceiverOptions } from '../services/transfer/receiver';
import { TransferSender } from '../services/transfer/sender';
import { defaultTransferEffects } from '../services/transferEffects';
import type { TransferEffects } from '../services/transferEffects';
import { WebRtcService } from '../services/webrtc';
import type { ConnectionEventHandler } from '../services/webrtc';
import type { ReceiverEvents, SenderEvents } from '../types/transfer';

export type SessionConnection = Pick<WebRtcService, 'initSender' | 'initReceiver' | 'disconnectPeer' | 'destroy'>;

export type SessionSender = Pick<TransferSender, 'start' | 'updateFiles' | 'togglePause' | 'cancel'>;

export type SessionReceiver = Pick<TransferReceiver, 'startReceiving' | 'submitPin' | 'togglePause' | 'cancel'>;

/** Everything a session hook talks to outside React; swapped for fakes in tests. */
export interface SessionServices {
  createConnection(handlers: ConnectionEventHandler): SessionConnection;
  createSender(conn: DataConnection, events: SenderEvents): SessionSender;
  createReceiver(conn: DataConnection, events: ReceiverEvents, options?: ReceiverOptions): SessionReceiver;
  effects: TransferEffects;
}

export const defaultSessionServices: SessionServices = {
  createConnection: (handlers) => new WebRtcService(handlers),
  createSender: (conn, events) => new TransferSender(conn, events),
  createReceiver: (conn, events, options) => new TransferReceiver(conn, events, options),
  effects: defaultTransferEffects,
};
