import { useCallback, useEffect, useReducer, useRef } from 'react';
import { soundService } from '../services/sound';
import { describePeerError } from '../services/peerErrors';
import type { ShareLink } from '../utils/shareLink';
import type {
  AppSettings,
  PinPrompt,
  ReceiverStatus,
  TransferManifest,
  TransferMetrics,
  TransferResult,
} from '../types/transfer';
import { defaultSessionServices } from './sessionServices';
import type { SessionConnection, SessionReceiver, SessionServices } from './sessionServices';

export interface ReceiverSessionState {
  status: ReceiverStatus;
  roomCode: string;
  /** Connected with the sender's link key, so no approval is needed (only files may still be missing) */
  isInvited: boolean;
  pin: string;
  pinPrompt: PinPrompt | null;
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
  | { type: 'CONNECTED'; isInvited: boolean }
  | { type: 'CONNECT_FAILED'; error: string }
  | { type: 'PIN_REQUIRED'; prompt: PinPrompt }
  | { type: 'PIN_SUBMITTED' }
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
const AWAITING_SENDER: ReceiverStatus[] = ['connecting', 'waiting_approval', 'pin_required', 'verifying_pin', 'connected'];

export function receiverReducer(state: ReceiverSessionState, action: ReceiverAction): ReceiverSessionState {
  switch (action.type) {
    case 'ROOM_CODE_CHANGED':
      return { ...state, roomCode: action.roomCode };
    case 'PIN_CHANGED':
      return { ...state, pin: action.pin };
    case 'CONNECT_REQUESTED':
      return {
        ...state,
        ...noProgress,
        status: 'connecting',
        isInvited: false,
        error: null,
        manifest: null,
        corruptedFiles: [],
      };
    case 'CONNECTED':
      return { ...state, status: 'waiting_approval', isInvited: action.isInvited };
    case 'CONNECT_FAILED':
      return { ...state, status: 'error', error: action.error };
    case 'PIN_REQUIRED':
      // After a wrong attempt, clear the field so the next try starts fresh
      return {
        ...state,
        status: 'pin_required',
        pinPrompt: action.prompt,
        pin: action.prompt.isIncorrect ? '' : state.pin,
      };
    case 'PIN_SUBMITTED':
      return { ...state, status: 'verifying_pin' };
    case 'MANIFEST_RECEIVED':
      return { ...state, status: 'connected', manifest: action.manifest, pinPrompt: null };
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
  isInvited: false,
  pin: '',
  pinPrompt: null,
  manifest: null,
  metrics: null,
  isPaused: false,
  error: null,
  corruptedFiles: [],
};

const noShareLink: ShareLink = { roomCode: '', shareKey: null };

interface UseReceiverSessionOptions {
  /** Leaving receive mode tears down any connection */
  active: boolean;
  settings: AppSettings;
  /** From the address the page was opened with: pre-fills the room, and a key connects straight away */
  shareLink?: ShareLink;
  services?: SessionServices;
}

export function useReceiverSession({
  active,
  settings,
  shareLink = noShareLink,
  services = defaultSessionServices,
}: UseReceiverSessionOptions) {
  const [state, dispatch] = useReducer(receiverReducer, { ...initialReceiverState, roomCode: shareLink.roomCode });
  const connectionRef = useRef<SessionConnection | null>(null);
  const engineRef = useRef<SessionReceiver | null>(null);
  // True between the user starting to save and the transfer ending, for wake lock and sounds
  const isRunningRef = useRef(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const endRun = useCallback(
    (isSuccessful: boolean) => {
      if (isRunningRef.current) {
        isRunningRef.current = false;
        services.effects.onTransferEnded(isSuccessful);
      }
    },
    [services]
  );

  const teardown = useCallback(() => {
    const connection = connectionRef.current;
    endRun(false);
    connectionRef.current = null;
    engineRef.current = null;
    connection?.destroy();
  }, [endRun]);

  useEffect(() => {
    if (!active) {
      return;
    }
    return () => {
      teardown();
      dispatch({ type: 'RESET' });
    };
  }, [active, teardown]);

  /** Stops listening to the engine and closes the peer connection once queued messages are sent. */
  const leave = useCallback(() => {
    engineRef.current = null;
    connectionRef.current?.disconnectPeer();
  }, []);

  const connectTo = useCallback(
    async (requestedRoomCode: string) => {
      const roomCode = requestedRoomCode.trim().toUpperCase();
      if (!roomCode) {
        return;
      }
      // The key belongs to the room it was shared for; never hand it to another sender
      const shareKey = roomCode === shareLink.roomCode ? shareLink.shareKey : null;
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

        // Events from a receiver that has since been replaced or torn down are ignored
        const ifCurrent =
          <A extends unknown[]>(handler: (...args: A) => void) =>
          (...args: A) => {
            if (engineRef.current === engine) {
              handler(...args);
            }
          };

        const engine = services.createReceiver(
          conn,
          {
            onPinRequired: ifCurrent((prompt) => dispatch({ type: 'PIN_REQUIRED', prompt })),
            onManifest: ifCurrent((manifest) => dispatch({ type: 'MANIFEST_RECEIVED', manifest })),
            onMetrics: ifCurrent((metrics) => dispatch({ type: 'METRICS', metrics })),
            onPaused: ifCurrent((isPaused) => dispatch({ type: 'PAUSED', isPaused })),
            onAllCompleted: ifCurrent((result) => {
              endRun(true);
              leave();
              dispatch({ type: 'COMPLETED', result });
            }),
            onError: ifCurrent((error) => {
              endRun(false);
              leave();
              dispatch({ type: 'FAILED', error });
            }),
            onCancelled: ifCurrent(() => {
              endRun(false);
              leave();
              dispatch({ type: 'FAILED', error: 'The sender cancelled the transfer.' });
            }),
          },
          { shareKey }
        );
        engineRef.current = engine;
        soundService.playConnect();
        dispatch({ type: 'CONNECTED', isInvited: shareKey !== null });
      } catch (err) {
        if (connectionRef.current === connection) {
          teardown();
          dispatch({
            type: 'CONNECT_FAILED',
            error: describePeerError(err),
          });
        }
      }
    },
    [services, teardown, endRun, leave, shareLink]
  );

  // Opening the sender's link connects straight away: its key admits us without the sender having to accept
  useEffect(() => {
    if (active && shareLink.shareKey) {
      connectTo(shareLink.roomCode);
    }
  }, [active, connectTo, shareLink]);

  const startSaving = async () => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    dispatch({ type: 'SAVING_STARTED' });
    const isStarted = await engine.startReceiving();
    if (engineRef.current !== engine) {
      // A storage failure already moved the session to 'error' via onError
      return;
    }
    if (isStarted) {
      isRunningRef.current = true;
      services.effects.onTransferStarted();
    } else {
      dispatch({ type: 'SAVING_ABORTED' });
    }
  };

  const cancel = () => {
    const engine = engineRef.current;
    engine?.cancel();
    endRun(false);
    leave();
    dispatch({ type: 'CANCELLED' });
  };

  return {
    state,
    actions: {
      setRoomCode: (roomCode: string) => dispatch({ type: 'ROOM_CODE_CHANGED', roomCode }),
      setPin: (pin: string) => dispatch({ type: 'PIN_CHANGED', pin }),
      connect: () => connectTo(state.roomCode),
      submitPin: () => {
        engineRef.current?.submitPin(state.pin);
        dispatch({ type: 'PIN_SUBMITTED' });
      },
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
