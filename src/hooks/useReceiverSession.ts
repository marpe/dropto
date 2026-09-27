import { useEffect, useReducer, useRef } from 'react';
import type { TransferResult } from '../services/transferEngine';
import { soundService } from '../services/sound';
import type { AppSettings, ReceiverStatus, TransferManifest, TransferMetrics } from '../types/transfer';
import { defaultSessionServices } from './sessionServices';
import type { SessionConnection, SessionEngine, SessionServices } from './sessionServices';

export interface ReceiverSessionState {
  status: ReceiverStatus;
  roomCode: string;
  pin: string;
  manifest: TransferManifest | null;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
  corruptedFiles: string[];
}

type ReceiverAction =
  | { type: 'ROOM_CODE_CHANGED'; roomCode: string }
  | { type: 'PIN_CHANGED'; pin: string }
  | { type: 'CONNECT_REQUESTED' }
  | { type: 'CONNECTED' }
  | { type: 'CONNECT_FAILED'; error: string }
  | { type: 'MANIFEST_RECEIVED'; manifest: TransferManifest }
  | { type: 'PEER_DISCONNECTED' }
  | { type: 'SAVING_STARTED' }
  | { type: 'SAVING_ABORTED' }
  | { type: 'METRICS'; metrics: TransferMetrics }
  | { type: 'PAUSED'; isPaused: boolean }
  | { type: 'COMPLETED'; result: TransferResult }
  | { type: 'FAILED'; error: string }
  | { type: 'CANCELLED' }
  | { type: 'RESET' };

const noProgress = { metrics: null, isPaused: false } as const;

// Before a transfer starts, losing the sender means it declined or went away
const AWAITING_SENDER: ReceiverStatus[] = ['connecting', 'waiting_approval', 'connected'];

export function receiverReducer(state: ReceiverSessionState, action: ReceiverAction): ReceiverSessionState {
  switch (action.type) {
    case 'ROOM_CODE_CHANGED':
      return { ...state, roomCode: action.roomCode };
    case 'PIN_CHANGED':
      return { ...state, pin: action.pin };
    case 'CONNECT_REQUESTED':
      return { ...state, ...noProgress, status: 'connecting', error: null, manifest: null, corruptedFiles: [] };
    case 'CONNECTED':
      return { ...state, status: 'waiting_approval' };
    case 'CONNECT_FAILED':
      return { ...state, status: 'error', error: action.error };
    case 'MANIFEST_RECEIVED':
      return { ...state, status: 'connected', manifest: action.manifest };
    case 'PEER_DISCONNECTED':
      if (!AWAITING_SENDER.includes(state.status)) {
        return state;
      }
      return {
        ...state,
        status: 'error',
        manifest: null,
        error: 'The sender declined the connection or went offline.',
      };
    case 'SAVING_STARTED':
      return { ...state, ...noProgress, status: 'transferring' };
    case 'SAVING_ABORTED':
      return { ...state, status: 'connected' };
    case 'METRICS':
      return { ...state, metrics: action.metrics };
    case 'PAUSED':
      return { ...state, isPaused: action.isPaused };
    case 'COMPLETED':
      return { ...state, status: 'completed', isPaused: false, corruptedFiles: action.result.corruptedFiles };
    case 'FAILED':
      return { ...state, ...noProgress, status: 'error', error: action.error, manifest: null };
    case 'CANCELLED':
      return { ...state, ...noProgress, status: 'idle', error: null, manifest: null };
    case 'RESET':
      return { ...initialReceiverState, roomCode: state.roomCode };
  }
}

export const initialReceiverState: ReceiverSessionState = {
  status: 'idle',
  roomCode: '',
  pin: '',
  manifest: null,
  metrics: null,
  isPaused: false,
  error: null,
  corruptedFiles: [],
};

interface UseReceiverSessionOptions {
  /** Leaving receive mode tears down any connection */
  active: boolean;
  settings: AppSettings;
  /** Prefilled from a ?room= share link */
  initialRoomCode?: string;
  services?: SessionServices;
}

export function useReceiverSession({
  active,
  settings,
  initialRoomCode = '',
  services = defaultSessionServices,
}: UseReceiverSessionOptions) {
  const [state, dispatch] = useReducer(receiverReducer, { ...initialReceiverState, roomCode: initialRoomCode });
  const connectionRef = useRef<SessionConnection | null>(null);
  const engineRef = useRef<SessionEngine | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const teardown = () => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    engineRef.current = null;
    connection?.destroy();
  };

  useEffect(() => {
    if (!active) {
      return;
    }
    return () => {
      teardown();
      dispatch({ type: 'RESET' });
    };
  }, [active]);

  /** Stops listening to the engine and closes the peer connection once queued messages are sent. */
  const leave = () => {
    engineRef.current = null;
    connectionRef.current?.disconnectPeer();
  };

  const connect = async () => {
    const roomCode = state.roomCode.trim().toUpperCase();
    if (!roomCode) {
      return;
    }
    teardown();
    dispatch({ type: 'CONNECT_REQUESTED' });

    const connection = services.createConnection({
      onDisconnected: () => {
        if (connectionRef.current === connection) {
          dispatch({ type: 'PEER_DISCONNECTED' });
        }
      },
      onError: (err) => {
        console.error('WebRTC error:', err);
      },
    });
    connectionRef.current = connection;

    try {
      const conn = await connection.initReceiver(roomCode, settingsRef.current);
      if (connectionRef.current !== connection) {
        return;
      }

      const engine = services.createEngine();
      engineRef.current = engine;
      const ifCurrent =
        <A extends unknown[]>(handler: (...args: A) => void) =>
        (...args: A) => {
          if (engineRef.current === engine) {
            handler(...args);
          }
        };

      engine.init(conn, false, {
        onManifest: ifCurrent((manifest) => dispatch({ type: 'MANIFEST_RECEIVED', manifest })),
        onMetrics: ifCurrent((metrics) => dispatch({ type: 'METRICS', metrics })),
        onPaused: ifCurrent((isPaused) => dispatch({ type: 'PAUSED', isPaused })),
        onAllCompleted: ifCurrent((result) => {
          leave();
          dispatch({ type: 'COMPLETED', result });
        }),
        onError: ifCurrent((error) => {
          leave();
          dispatch({ type: 'FAILED', error });
        }),
        onCancelled: ifCurrent(() => {
          leave();
          dispatch({ type: 'FAILED', error: 'The sender cancelled the transfer.' });
        }),
      });
      soundService.playConnect();
      dispatch({ type: 'CONNECTED' });
    } catch (err: any) {
      if (connectionRef.current === connection) {
        teardown();
        dispatch({
          type: 'CONNECT_FAILED',
          error: err?.message || 'Failed to connect to the room. Check the room code.',
        });
      }
    }
  };

  const startSaving = async () => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    dispatch({ type: 'SAVING_STARTED' });
    const started = await engine.startReceiving();
    // A storage failure has already moved the session to 'error' via onError
    if (!started && engineRef.current === engine) {
      dispatch({ type: 'SAVING_ABORTED' });
    }
  };

  const cancel = () => {
    const engine = engineRef.current;
    engine?.cancel();
    leave();
    dispatch({ type: 'CANCELLED' });
  };

  return {
    state,
    actions: {
      setRoomCode: (roomCode: string) => dispatch({ type: 'ROOM_CODE_CHANGED', roomCode }),
      setPin: (pin: string) => dispatch({ type: 'PIN_CHANGED', pin }),
      connect,
      startSaving,
      togglePause: () => engineRef.current?.togglePause(),
      cancel,
      reset: () => {
        teardown();
        dispatch({ type: 'RESET' });
      },
    },
  };
}
