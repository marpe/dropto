import { useCallback, useEffect, useReducer, useRef } from 'react';
import { soundService } from '../services/sound';
import { describePeerError } from '../services/peerErrors';
import { parseShareUrl } from '../utils/shareLink';
import { introduceThisDevice } from '../utils/deviceInfo';
import type { ShareLink } from '../utils/shareLink';
import type { AppSettings } from '../types/transfer';
import { initialReceiverState, receiverReducer } from './receiverState';
import { defaultSessionServices } from './sessionServices';
import type { SessionConnection, SessionReceiver, SessionServices } from './sessionServices';

export type ReceiverSession = ReturnType<typeof useReceiverSession>;

// A sender that went away is retried, waiting a little longer each time (3 s, 6 s … 15 s): about four minutes
// in all, long enough for a reload or a flaky network, after which Try again is up to the user
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_BACKOFF = 5;
const MAX_RECONNECT_ATTEMPTS = 20;

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
  // While a download runs, a dropped connection cuts it off; it is cancelled before reconnecting
  const hasStartedSavingRef = useRef(false);
  // After leaving (done, failed, cancelled), the connection closing is expected, not a reason to reconnect
  const hasLeftRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // What a reconnect goes back to, so Retry now can skip the wait
  const reconnectTargetRef = useRef<{ roomCode: string; link: ShareLink } | null>(null);
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
        reconnectTargetRef.current = { roomCode, link };
        const delayMs = reconnectDelayMs * Math.min(attempt, MAX_RECONNECT_BACKOFF);
        reconnectTimerRef.current = setTimeout(() => connectToRoom(roomCode, link, attempt), delayMs);
      };
      // Reached from both the signalling connection closing and the engine losing its data channel. Unless this
      // side left on purpose, the sender is tried again: a reload or a network blip should not end the session
      const handleSenderGone = () => {
        if (connectionRef.current !== connection || hasLeftRef.current) {
          return;
        }
        if (hasStartedSavingRef.current) {
          // The cut-off download cannot resume; cancelling closes its half-written file
          engineRef.current?.cancel();
        }
        scheduleReconnect(1);
      };

      const connection = services.createConnection({
        onDisconnected: handleSenderGone,
        onError: (err) => {
          console.error('WebRTC error:', err);
        },
      });
      connectionRef.current = connection;

      // Looked up alongside connecting, so it never holds up the HELLO
      const introducing = introduceThisDevice();
      try {
        const conn = await connection.initReceiver(roomCode, settingsRef.current);
        const introduction = await introducing;
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
              // Still connected: the user may download more, or the same files again
              endRun(true);
              hasStartedSavingRef.current = false;
              dispatch({ type: 'COMPLETED', result });
            }),
            onError: ifCurrent((error) => {
              endRun(false);
              leave();
              dispatch({ type: 'FAILED', error });
            }),
            onConnectionLost: ifCurrent(handleSenderGone),
            onPeerLeft: ifCurrent(handleSenderGone),
            onCancelled: ifCurrent(() => {
              endRun(false);
              leave();
              dispatch({ type: 'FAILED', error: 'The sender cancelled the transfer.' });
            }),
          },
          { shareKey, introduction }
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
          error: reconnectAttempt > 0 ? 'The sender went offline.' : describePeerError(err),
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
    // The save picker opens synchronously first; the notification prompt then shares the same click
    const starting = engine.startReceiving(fileIndices);
    services.effects.onTransferRequested();
    const isStarted = await starting;
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
      /** Skips the wait before the next reconnect attempt */
      retryNow: () => {
        const target = reconnectTargetRef.current;
        if (target) {
          connectTo(target.roomCode, target.link, 1);
        }
      },
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
