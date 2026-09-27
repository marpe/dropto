import { TransferEngine } from '../services/transferEngine';
import { WebRtcService } from '../services/webrtc';
import type { ConnectionEventHandler } from '../services/webrtc';

export type SessionConnection = Pick<WebRtcService, 'initSender' | 'initReceiver' | 'disconnectPeer' | 'destroy'>;

export type SessionEngine = Pick<
  TransferEngine,
  'init' | 'startSenderTransfer' | 'startReceiving' | 'togglePause' | 'cancel'
>;

/** Creates the per-session signalling connection and transfer engine; swapped for fakes in tests. */
export interface SessionServices {
  createConnection(handlers: ConnectionEventHandler): SessionConnection;
  createEngine(): SessionEngine;
}

export const defaultSessionServices: SessionServices = {
  createConnection: (handlers) => new WebRtcService(handlers),
  createEngine: () => new TransferEngine(),
};
