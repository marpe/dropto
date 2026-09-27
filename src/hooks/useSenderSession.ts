import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { DataConnection } from 'peerjs';
import { soundService } from '../services/sound';
import { describePeerError } from '../services/peerErrors';
import type { AppSettings, SenderStatus, TransferFile, TransferMetrics, TransferResult } from '../types/transfer';
import { generateShareKey } from '../utils/shareLink';
import { recallRoom, rememberRoom } from '../utils/roomMemory';
import { defaultSessionServices } from './sessionServices';
import type { SessionConnection, SessionSender, SessionServices } from './sessionServices';

export interface SenderSessionState {
  status: SenderStatus;
  roomCode: string;
  /** Secret carried in the share link; receivers presenting it are admitted without asking */
  shareKey: string;
  files: TransferFile[];
  pin: string;
  pendingPeerId: string | null;
  /** The pending receiver opened the share link; it is admitted as soon as files are queued */
  isPendingPeerTrusted: boolean;
  connectedPeerId: string | null;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
  corruptedFiles: string[];
}

type SenderAction =
  | { type: 'ROOM_REQUESTED' }
  | { type: 'ROOM_READY'; roomCode: string; shareKey: string }
  | { type: 'ROOM_FAILED'; error: string }
  | { type: 'ROOM_CLOSED' }
  | { type: 'FILES_ADDED'; files: TransferFile[] }
  | { type: 'FILE_REMOVED'; fileId: string }
  | { type: 'FILES_CLEARED' }
  | { type: 'QUEUE_EMPTIED' }
  | { type: 'PIN_CHANGED'; pin: string }
  | { type: 'PEER_REQUESTED'; peerId: string; isTrusted: boolean }
  | { type: 'PEER_REJECTED' }
  | { type: 'PEER_DISCONNECTED'; peerId?: string }
  | { type: 'TRANSFER_STARTED'; peerId: string }
  | { type: 'RECEIVER_STARTED' }
  | { type: 'METRICS'; metrics: TransferMetrics }
  | { type: 'PAUSED'; isPaused: boolean }
  | { type: 'COMPLETED'; result: TransferResult }
  | { type: 'FAILED'; error: string }
  | { type: 'CANCELLED' }
  | { type: 'ERROR_DISMISSED' };

export const initialSenderState: SenderSessionState = {
  status: 'idle',
  roomCode: '',
  shareKey: '',
  files: [],
  pin: '',
  pendingPeerId: null,
  isPendingPeerTrusted: false,
  connectedPeerId: null,
  metrics: null,
  isPaused: false,
  error: null,
  corruptedFiles: [],
};

// Per-transfer progress, cleared whenever a transfer starts or ends
const noProgress = { metrics: null, isPaused: false } as const;

export function senderReducer(state: SenderSessionState, action: SenderAction): SenderSessionState {
  switch (action.type) {
    case 'ROOM_REQUESTED':
      return { ...state, status: 'waiting', roomCode: '', shareKey: '', error: null };
    case 'ROOM_READY':
      return { ...state, roomCode: action.roomCode, shareKey: action.shareKey };
    case 'ROOM_FAILED':
      return { ...state, error: action.error };
    case 'ROOM_CLOSED':
      return {
        ...state,
        ...noProgress,
        status: 'idle',
        roomCode: '',
        shareKey: '',
        pendingPeerId: null,
        isPendingPeerTrusted: false,
        connectedPeerId: null,
        error: null,
      };
    case 'FILES_ADDED':
      return { ...state, files: [...state.files, ...action.files] };
    case 'FILE_REMOVED':
      return { ...state, files: state.files.filter((f) => f.id !== action.fileId) };
    case 'FILES_CLEARED':
      return { ...state, ...noProgress, files: [], status: 'waiting', connectedPeerId: null, corruptedFiles: [] };
    case 'QUEUE_EMPTIED':
      return { ...state, files: [] };
    case 'PIN_CHANGED':
      return { ...state, pin: action.pin };
    case 'PEER_REQUESTED':
      return { ...state, pendingPeerId: action.peerId, isPendingPeerTrusted: action.isTrusted };
    case 'PEER_REJECTED':
      return { ...state, pendingPeerId: null, isPendingPeerTrusted: false };
    case 'PEER_DISCONNECTED': {
      // A late close from an earlier receiver must not clear a newer one
      const matches = (peerId: string | null) => !action.peerId || peerId === action.peerId;
      const isPendingGone = matches(state.pendingPeerId);
      return {
        ...state,
        pendingPeerId: isPendingGone ? null : state.pendingPeerId,
        isPendingPeerTrusted: isPendingGone ? false : state.isPendingPeerTrusted,
        connectedPeerId: matches(state.connectedPeerId) ? null : state.connectedPeerId,
      };
    }
    case 'TRANSFER_STARTED':
      return {
        ...state,
        ...noProgress,
        status: 'awaiting_receiver',
        connectedPeerId: action.peerId,
        pendingPeerId: null,
        isPendingPeerTrusted: false,
        error: null,
        corruptedFiles: [],
      };
    case 'RECEIVER_STARTED':
      return state.status === 'awaiting_receiver' ? { ...state, status: 'transferring' } : state;
    case 'METRICS':
      return { ...state, metrics: action.metrics };
    case 'PAUSED':
      return { ...state, isPaused: action.isPaused };
    case 'COMPLETED':
      return { ...state, status: 'completed', isPaused: false, corruptedFiles: action.result.corruptedFiles };
    case 'FAILED':
      return { ...state, ...noProgress, status: 'failed', error: action.error, connectedPeerId: null };
    case 'CANCELLED':
      return { ...state, ...noProgress, status: 'waiting', connectedPeerId: null };
    case 'ERROR_DISMISSED':
      return { ...state, ...noProgress, status: 'waiting', error: null };
  }
}

function toTransferFile(file: File): TransferFile {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    relativePath: file.webkitRelativePath || undefined,
    lastModified: file.lastModified,
    rawFile: file,
  };
}

interface UseSenderSessionOptions {
  /** A room is open only while active (i.e. the app is in send mode) */
  active: boolean;
  settings: AppSettings;
  services?: SessionServices;
}

export function useSenderSession({ active, settings, services = defaultSessionServices }: UseSenderSessionOptions) {
  const [state, dispatch] = useReducer(senderReducer, initialSenderState);
  const connectionRef = useRef<SessionConnection | null>(null);
  const engineRef = useRef<SessionSender | null>(null);
  const pendingConnRef = useRef<DataConnection | null>(null);
  const shareKeyRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  // Read by connection callbacks, which outlive the render that registered them
  const queueRef = useRef({ files: state.files, pin: state.pin });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    queueRef.current = { files: state.files, pin: state.pin };
  }, [state.files, state.pin]);

  const startTransfer = useCallback(
    (conn: DataConnection, files: TransferFile[], pin: string) => {
      // Events from a sender that has since been replaced or torn down are ignored
      const ifCurrent =
        <A extends unknown[]>(handler: (...args: A) => void) =>
        (...args: A) => {
          if (engineRef.current === engine) {
            handler(...args);
          }
        };
      const endTransfer = (isSuccessful: boolean) => {
        engineRef.current = null;
        services.effects.onTransferEnded(isSuccessful);
      };
      let hasReceiverStarted = false;

      const engine = services.createSender(conn, {
        onReceiverStarted: ifCurrent(() => {
          hasReceiverStarted = true;
          dispatch({ type: 'RECEIVER_STARTED' });
        }),
        onMetrics: ifCurrent((metrics) => dispatch({ type: 'METRICS', metrics })),
        onPaused: ifCurrent((isPaused) => dispatch({ type: 'PAUSED', isPaused })),
        onAllCompleted: ifCurrent((result) => {
          endTransfer(true);
          dispatch({ type: 'COMPLETED', result });
        }),
        onError: ifCurrent((error) => {
          endTransfer(false);
          connectionRef.current?.disconnectPeer();
          // A receiver closing or reloading the page before downloading is not a failed transfer
          const hasReceiverLeftEarly = !hasReceiverStarted && !conn.open;
          dispatch(hasReceiverLeftEarly ? { type: 'CANCELLED' } : { type: 'FAILED', error });
        }),
        onCancelled: ifCurrent(() => {
          endTransfer(false);
          connectionRef.current?.disconnectPeer();
          dispatch({ type: 'CANCELLED' });
        }),
      });
      engineRef.current = engine;
      services.effects.onTransferStarted();
      dispatch({ type: 'TRANSFER_STARTED', peerId: conn.peer });
      engine.start(files, pin);
    },
    [services]
  );

  const openRoom = useCallback(async () => {
    connectionRef.current?.destroy();
    engineRef.current = null;
    pendingConnRef.current = null;
    shareKeyRef.current = null;
    dispatch({ type: 'ROOM_REQUESTED' });

    const connection = services.createConnection({
      onIncomingConnection: (conn, greeting) => {
        if (connectionRef.current !== connection) {
          return;
        }
        soundService.playConnect();
        const isTrusted = greeting.shareKey !== null && greeting.shareKey === shareKeyRef.current;
        const { files, pin } = queueRef.current;
        if (isTrusted && files.length > 0) {
          startTransfer(conn, files, pin);
          return;
        }
        pendingConnRef.current = conn;
        dispatch({ type: 'PEER_REQUESTED', peerId: conn.peer, isTrusted });
      },
      onDisconnected: (peerId) => {
        if (connectionRef.current !== connection) {
          return;
        }
        if (!peerId || pendingConnRef.current?.peer === peerId) {
          pendingConnRef.current = null;
        }
        dispatch({ type: 'PEER_DISCONNECTED', peerId });
      },
      onError: (err) => {
        console.error('WebRTC error:', err);
      },
    });
    connectionRef.current = connection;

    try {
      const remembered = recallRoom();
      const roomCode = await connection.initSender(settingsRef.current, { preferredRoomId: remembered?.roomCode });
      if (connectionRef.current === connection) {
        // Links already handed out stay valid only while both the room and its key survive
        const shareKey = remembered?.roomCode === roomCode ? remembered.shareKey : generateShareKey();
        shareKeyRef.current = shareKey;
        rememberRoom({ roomCode, shareKey });
        dispatch({ type: 'ROOM_READY', roomCode, shareKey });
      }
    } catch (err) {
      if (connectionRef.current === connection) {
        dispatch({ type: 'ROOM_FAILED', error: describePeerError(err) });
      }
    }
  }, [services, startTransfer]);

  useEffect(() => {
    if (!active) {
      return;
    }
    openRoom();
    return () => {
      const connection = connectionRef.current;
      if (engineRef.current) {
        services.effects.onTransferEnded(false);
      }
      connectionRef.current = null;
      engineRef.current = null;
      pendingConnRef.current = null;
      shareKeyRef.current = null;
      connection?.destroy();
      dispatch({ type: 'ROOM_CLOSED' });
    };
  }, [active, openRoom, services]);

  const approvePeer = () => {
    const conn = pendingConnRef.current;
    // An empty manifest would leave both peers stuck; the request stays pending until files are added
    if (!conn || state.files.length === 0) {
      return;
    }
    pendingConnRef.current = null;
    startTransfer(conn, state.files, state.pin);
  };

  /** Keeps the receiver's view of the queue current until it starts downloading. */
  const offerFiles = (files: TransferFile[]) => {
    if (state.status === 'awaiting_receiver') {
      engineRef.current?.updateFiles(files);
      return;
    }
    const conn = pendingConnRef.current;
    if (conn && state.isPendingPeerTrusted && files.length > 0) {
      pendingConnRef.current = null;
      startTransfer(conn, files, state.pin);
    }
  };

  const addFiles = (rawFiles: File[]) => {
    const added = rawFiles.map(toTransferFile);
    dispatch({ type: 'FILES_ADDED', files: added });
    offerFiles([...state.files, ...added]);
  };

  const removeFile = (fileId: string) => {
    dispatch({ type: 'FILE_REMOVED', fileId });
    offerFiles(state.files.filter((file) => file.id !== fileId));
  };

  const rejectPeer = () => {
    const conn = pendingConnRef.current;
    pendingConnRef.current = null;
    conn?.close();
    dispatch({ type: 'PEER_REJECTED' });
  };

  const cancel = () => {
    const engine = engineRef.current;
    engineRef.current = null;
    if (engine) {
      engine.cancel();
      services.effects.onTransferEnded(false);
    }
    connectionRef.current?.disconnectPeer();
    dispatch({ type: 'CANCELLED' });
  };

  const clearFiles = () => {
    if (state.status === 'awaiting_receiver') {
      dispatch({ type: 'QUEUE_EMPTIED' });
      offerFiles([]);
      return;
    }
    engineRef.current = null;
    connectionRef.current?.disconnectPeer();
    dispatch({ type: 'FILES_CLEARED' });
  };

  return {
    state,
    actions: {
      addFiles,
      removeFile,
      clearFiles,
      setPin: (pin: string) => dispatch({ type: 'PIN_CHANGED', pin }),
      approvePeer,
      rejectPeer,
      togglePause: () => engineRef.current?.togglePause(),
      cancel,
      dismissError: () => dispatch({ type: 'ERROR_DISMISSED' }),
      retryRoom: openRoom,
    },
  };
}
