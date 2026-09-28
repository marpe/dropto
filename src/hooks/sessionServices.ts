import type { DataConnection } from 'peerjs';
import { TransferReceiver } from '../services/transfer/receiver';
import type { ReceiverOptions } from '../services/transfer/receiver';
import { TransferSender } from '../services/transfer/sender';
import { readRemoteAddress } from '../services/peerAddress';
import type { RemoteAddress } from '../services/peerAddress';
import { defaultTransferEffects } from '../services/transferEffects';
import type { TransferEffects } from '../services/transferEffects';
import { WebRtcService } from '../services/webrtc';
import type { ConnectionEventHandler } from '../services/webrtc';
import type { ReceiverEvents, SenderEvents } from '../types/transfer';
import { HandleStore, readHandle, requestReadAccess, supportsHandlePersistence } from '../utils/fileHandles';
import type { HandleReadResult } from '../utils/fileHandles';

export type SessionConnection = Pick<WebRtcService, 'initSender' | 'initReceiver' | 'disconnectPeer' | 'destroy'>;

export type SessionSender = Pick<TransferSender, 'start' | 'updateFiles' | 'holdUntil' | 'togglePause' | 'cancel' | 'interrupt'>;

export type SessionReceiver = Pick<TransferReceiver, 'startReceiving' | 'submitPin' | 'togglePause' | 'cancel' | 'interrupt'>;

/** Handles to the sender's files, kept (Chromium only) so a reload can read the same files again. */
export interface FileHandleServices {
  /** Keyed by file identity (path, size, date), which survives a reload where ids of re-added files might not */
  store: Pick<HandleStore, 'saveMany' | 'load' | 'remove' | 'clear'>;
  read(handle: FileSystemFileHandle): Promise<HandleReadResult>;
  /** Must run inside a click */
  requestAccess(handles: FileSystemFileHandle[]): Promise<boolean>;
}

/** Everything a session hook talks to outside React; swapped for fakes in tests. */
export interface SessionServices {
  createConnection(handlers: ConnectionEventHandler): SessionConnection;
  createSender(conn: DataConnection, events: SenderEvents): SessionSender;
  createReceiver(conn: DataConnection, events: ReceiverEvents, options?: ReceiverOptions): SessionReceiver;
  /** The receiver's IP and route as the connection sees them, when they can be known */
  readAddress(conn: DataConnection): Promise<RemoteAddress | null>;
  effects: TransferEffects;
  /** Null where the browser cannot keep file handles (Firefox, Safari) */
  fileHandles: FileHandleServices | null;
}

export const defaultSessionServices: SessionServices = {
  createConnection: (handlers) => new WebRtcService(handlers),
  createSender: (conn, events) => new TransferSender(conn, events),
  createReceiver: (conn, events, options) => new TransferReceiver(conn, events, options),
  readAddress: readRemoteAddress,
  effects: defaultTransferEffects,
  fileHandles: supportsHandlePersistence()
    ? { store: new HandleStore(), read: readHandle, requestAccess: requestReadAccess }
    : null,
};
