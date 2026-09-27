import { useCallback, useEffect, useReducer, useRef } from 'react';
import { soundService } from '../services/sound';
import { describePeerError } from '../services/peerErrors';
import { parseShareUrl } from '../utils/shareLink';
import { introduceThisDevice } from '../utils/deviceInfo';
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
  /** The last share link seen (opened or pasted); its key is only ever sent to its own room */
  link: ShareLink;
  /** Connected with the sender's link key, so no approval is needed (only files may still be missing) */
  isInvited: boolean;
  /** Manifest indices being downloaded; null until saving starts */
  selectedFileIndices: number[] | null;
  pin: string;
  pinPrompt: PinPrompt | null;
  /** Place in the sender's line while it is busy with others; 1 means next */
  queuePosition: number | null;
  manifest: TransferManifest | null;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
  corruptedFiles: string[];
}

type ReceiverAction =
  | { type: 'ROOM_CODE_CHANGED'; roomCode: string }
  | { type: 'LINK_PASTED'; link: ShareLink }
  | { type: 'PIN_CHANGED'; pin: string }
  | { type: 'CONNECT_REQUESTED' }
  | { type: 'CONNECTED'; isInvited: boolean }
  | { type: 'CONNECT_FAILED'; error: string }
  | { type: 'QUEUED'; position: number }
  | { type: 'PIN_REQUIRED'; prompt: PinPrompt }
  | { type: 'PIN_SUBMITTED' }
  | { type: 'MANIFEST_RECEIVED'; manifest: TransferManifest }
  | { type: 'SENDER_LOST' }
  | { type: 'RECONNECTING' }
  | { type: 'SAVING_STARTED'; fileIndices: number[] | null }
  | { type: 'SAVING_ABORTED' }
  | { type: 'METRICS'; metrics: TransferMetrics }
  | { type: 'PAUSED'; isPaused: boolean }
  | { type: 'COMPLETED'; result: TransferResult }
  | { type: 'FAILED'; error: string }
  | { type: 'CANCELLED' }
  | { type: 'RESET' };

const noProgress = { metrics: null, isPaused: false } as const;

// Before a transfer starts, losing the sender means it declined or went away
const AWAITING_SENDER: ReceiverStatus[] = [
  'connecting',
  'reconnecting',
  'waiting_approval',
  'queued',
  'pin_required',
  'verifying_pin',
  'connected',
];

// Link receivers retry for about half a minute: long enough for the sender's page to reload
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function receiverReducer(state: ReceiverSessionState, action: ReceiverAction): ReceiverSessionState {
  switch (action.type) {
    case 'ROOM_CODE_CHANGED':
      return { ...state, roomCode: action.roomCode.toUpperCase() };
    case 'LINK_PASTED':
      return { ...state, roomCode: action.link.roomCode, link: action.link };
    case 'PIN_CHANGED':
      return { ...state, pin: action.pin };
    case 'CONNECT_REQUESTED':
      return {
        ...state,
        ...noProgress,
        status: 'connecting',
        isInvited: false,
        queuePosition: null,
        error: null,
        manifest: null,
        corruptedFiles: [],
      };
    case 'CONNECTED':
      return { ...state, status: 'waiting_approval', isInvited: action.isInvited };
    case 'CONNECT_FAILED':
      return { ...state, status: 'error', error: action.error };
    case 'QUEUED':
      return { ...state, status: 'queued', queuePosition: action.position };
    case 'PIN_REQUIRED':
      // After a wrong attempt, clear the field so the next try starts fresh
      return {
        ...state,
        status: 'pin_required',
        queuePosition: null,
        pinPrompt: action.prompt,
        pin: action.prompt.isIncorrect ? '' : state.pin,
      };
    case 'PIN_SUBMITTED':
      return { ...state, status: 'verifying_pin' };
    case 'MANIFEST_RECEIVED':
      return { ...state, status: 'connected', manifest: action.manifest, pinPrompt: null, queuePosition: null };
    case 'SENDER_LOST':
      if (state.status === 'transferring') {
        return { ...state, ...noProgress, status: 'error', error: 'The connection to the sender was lost.' };
      }
      if (!AWAITING_SENDER.includes(state.status)) {
        return state;
      }
      return {
        ...state,
        status: 'error',
        manifest: null,
        error: 'The sender declined the connection or went offline.',
      };
    case 'RECONNECTING':
      return { ...state, ...noProgress, status: 'reconnecting', manifest: null, pinPrompt: null, queuePosition: null };
    case 'SAVING_STARTED':
      return { ...state, ...noProgress, status: 'transferring', selectedFileIndices: action.fileIndices };
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
      return { ...initialReceiverState, roomCode: state.roomCode, link: state.link };
  }
}

export const initialReceiverState: ReceiverSessionState = {
  status: 'idle',
  roomCode: '',
  link: { roomCode: '', shareKey: null },
  isInvited: false,
  selectedFileIndices: null,
  pin: '',
  pinPrompt: null,
  queuePosition: null,
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
  reconnectDelayMs?: number;
}

export function useReceiverSession({
  active,
  settings,
  shareLink = noShareLink,
  services = defaultSessionServices,
  reconnectDelayMs = RECONNECT_DELAY_MS,
}: UseReceiverSessionOptions) {
  const [state, dispatch] = useReducer(receiverReducer, {
    ...initialReceiverState,
    // A link with its key connects straight away; start there so the code form never flashes first
    status: shareLink.shareKey ? 'connecting' : 'idle',
    roomCode: shareLink.roomCode,
    link: shareLink,
  });
  const connectionRef = useRef<SessionConnection | null>(null);
  const engineRef = useRef<SessionReceiver | null>(null);
  // True between the user starting to save and the transfer ending, for wake lock and sounds
  const isRunningRef = useRef(false);
  // Once the save location is chosen, a dropped connection is a failed transfer, not a reason to reconnect
  const hasStartedSavingRef = useRef(false);
  // After leaving (done, failed, cancelled), the connection closing is expected, not a reason to reconnect
  const hasLeftRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    clearTimeout(reconnectTimerRef.current);
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
    hasLeftRef.current = true;
    engineRef.current = null;
    connectionRef.current?.disconnectPeer();
  }, []);

  const connectTo = useCallback(
    async function connectToRoom(requestedRoomCode: string, link: ShareLink, reconnectAttempt = 0): Promise<void> {
      const roomCode = requestedRoomCode.trim().toUpperCase();
      if (!roomCode) {
        return;
      }
      // The key belongs to the room it was shared for; never hand it to another sender
      const shareKey = roomCode === link.roomCode ? link.shareKey : null;
      teardown();
      hasStartedSavingRef.current = false;
      hasLeftRef.current = false;
      if (reconnectAttempt === 0) {
        dispatch({ type: 'CONNECT_REQUESTED' });
      }

      const scheduleReconnect = (attempt: number) => {
        teardown();
        dispatch({ type: 'RECONNECTING' });
        reconnectTimerRef.current = setTimeout(() => connectToRoom(roomCode, link, attempt), reconnectDelayMs);
      };
      // Reached from both the signalling connection closing and the engine losing its data channel
      const handleSenderGone = () => {
        if (connectionRef.current !== connection || hasLeftRef.current) {
          return;
        }
        if (shareKey !== null && !hasStartedSavingRef.current) {
          scheduleReconnect(1);
          return;
        }
        endRun(false);
        leave();
        dispatch({ type: 'SENDER_LOST' });
      };

      const connection = services.createConnection({
        onDisconnected: handleSenderGone,
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
            onQueued: ifCurrent((position) => dispatch({ type: 'QUEUED', position })),
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
            onConnectionLost: ifCurrent(handleSenderGone),
            onCancelled: ifCurrent(() => {
              endRun(false);
              leave();
              dispatch({ type: 'FAILED', error: 'The sender cancelled the transfer.' });
            }),
          },
          { shareKey, introduction: introduceThisDevice() }
        );
        engineRef.current = engine;
        soundService.playConnect();
        dispatch({ type: 'CONNECTED', isInvited: shareKey !== null });
      } catch (err) {
        if (connectionRef.current !== connection) {
          return;
        }
        if (reconnectAttempt > 0 && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
          scheduleReconnect(reconnectAttempt + 1);
          return;
        }
        teardown();
        dispatch({
          type: 'CONNECT_FAILED',
          error: reconnectAttempt > 0 ? 'The sender went offline and did not come back.' : describePeerError(err),
        });
      }
    },
    [services, teardown, endRun, leave, reconnectDelayMs]
  );

  // Opening the sender's link connects straight away: its key admits us without the sender having to accept
  useEffect(() => {
    if (active && shareLink.shareKey) {
      connectTo(shareLink.roomCode, shareLink);
    }
  }, [active, connectTo, shareLink]);

  /** `fileIndices` picks a subset of the offered files; omitted, everything is downloaded. */
  const startSaving = async (fileIndices?: number[]) => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    hasStartedSavingRef.current = true;
    dispatch({ type: 'SAVING_STARTED', fileIndices: fileIndices ?? null });
    const isStarted = await engine.startReceiving(fileIndices);
    if (engineRef.current !== engine) {
      // A storage failure already moved the session to 'error' via onError
      return;
    }
    if (isStarted) {
      isRunningRef.current = true;
      services.effects.onTransferStarted();
    } else {
      hasStartedSavingRef.current = false;
      dispatch({ type: 'SAVING_ABORTED' });
    }
  };

  const cancel = () => {
    clearTimeout(reconnectTimerRef.current);
    const engine = engineRef.current;
    engine?.cancel();
    endRun(false);
    leave();
    dispatch({ type: 'CANCELLED' });
  };

  return {
    state,
    actions: {
      setRoomCode: (input: string) => {
        // Pasting the whole link is as good as opening it: connect straight away with its key
        const pastedLink = parseShareUrl(input);
        if (pastedLink) {
          dispatch({ type: 'LINK_PASTED', link: pastedLink });
          connectTo(pastedLink.roomCode, pastedLink);
          return;
        }
        dispatch({ type: 'ROOM_CODE_CHANGED', roomCode: input });
      },
      setPin: (pin: string) => dispatch({ type: 'PIN_CHANGED', pin }),
      connect: () => connectTo(state.roomCode, state.link),
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
