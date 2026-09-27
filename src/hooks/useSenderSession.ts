import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { DataConnection } from 'peerjs';
import { soundService } from '../services/sound';
import { describePeerError } from '../services/peerErrors';
import type { AppSettings, SenderStatus, TransferFile, TransferMetrics, TransferResult } from '../types/transfer';
import { defaultSessionServices } from './sessionServices';
import type { SessionConnection, SessionSender, SessionServices } from './sessionServices';

export interface SenderSessionState {
  status: SenderStatus;
  roomCode: string;
  files: TransferFile[];
  pin: string;
  pendingPeerId: string | null;
  connectedPeerId: string | null;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
  corruptedFiles: string[];
}

type SenderAction =
  | { type: 'ROOM_REQUESTED' }
  | { type: 'ROOM_READY'; roomCode: string }
  | { type: 'ROOM_FAILED'; error: string }
  | { type: 'ROOM_CLOSED' }
  | { type: 'FILES_ADDED'; files: TransferFile[] }
  | { type: 'FILE_REMOVED'; fileId: string }
  | { type: 'FILES_CLEARED' }
  | { type: 'PIN_CHANGED'; pin: string }
  | { type: 'PEER_REQUESTED'; peerId: string }
  | { type: 'PEER_REJECTED' }
  | { type: 'PEER_DISCONNECTED'; peerId?: string }
  | { type: 'TRANSFER_STARTED' }
  | { type: 'METRICS'; metrics: TransferMetrics }
  | { type: 'PAUSED'; isPaused: boolean }
  | { type: 'COMPLETED'; result: TransferResult }
  | { type: 'FAILED'; error: string }
  | { type: 'CANCELLED' }
  | { type: 'ERROR_DISMISSED' };

export const initialSenderState: SenderSessionState = {
  status: 'idle',
  roomCode: '',
  files: [],
  pin: '',
  pendingPeerId: null,
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
      return { ...state, status: 'waiting', roomCode: '', error: null };
    case 'ROOM_READY':
      return { ...state, roomCode: action.roomCode };
    case 'ROOM_FAILED':
      return { ...state, error: action.error };
    case 'ROOM_CLOSED':
      return {
        ...state,
        ...noProgress,
        status: 'idle',
        roomCode: '',
        pendingPeerId: null,
        connectedPeerId: null,
        error: null,
      };
    case 'FILES_ADDED':
      return { ...state, files: [...state.files, ...action.files] };
    case 'FILE_REMOVED':
      return { ...state, files: state.files.filter((f) => f.id !== action.fileId) };
    case 'FILES_CLEARED':
      return { ...state, ...noProgress, files: [], status: 'waiting', connectedPeerId: null, corruptedFiles: [] };
    case 'PIN_CHANGED':
      return { ...state, pin: action.pin };
    case 'PEER_REQUESTED':
      return { ...state, pendingPeerId: action.peerId };
    case 'PEER_REJECTED':
      return { ...state, pendingPeerId: null };
    case 'PEER_DISCONNECTED': {
      // A late close from an earlier receiver must not clear a newer one
      const matches = (peerId: string | null) => !action.peerId || peerId === action.peerId;
      return {
        ...state,
        pendingPeerId: matches(state.pendingPeerId) ? null : state.pendingPeerId,
        connectedPeerId: matches(state.connectedPeerId) ? null : state.connectedPeerId,
      };
    }
    case 'TRANSFER_STARTED':
      return {
        ...state,
        ...noProgress,
        status: 'transferring',
        connectedPeerId: state.pendingPeerId,
        pendingPeerId: null,
        error: null,
        corruptedFiles: [],
      };
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
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const openRoom = useCallback(async () => {
    connectionRef.current?.destroy();
    engineRef.current = null;
    pendingConnRef.current = null;
    dispatch({ type: 'ROOM_REQUESTED' });

    const connection = services.createConnection({
      onIncomingConnection: (conn) => {
        if (connectionRef.current !== connection) {
          return;
        }
        soundService.playConnect();
        pendingConnRef.current = conn;
        dispatch({ type: 'PEER_REQUESTED', peerId: conn.peer });
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
      const roomCode = await connection.initSender(settingsRef.current);
      if (connectionRef.current === connection) {
        dispatch({ type: 'ROOM_READY', roomCode });
      }
    } catch (err) {
      if (connectionRef.current === connection) {
        dispatch({ type: 'ROOM_FAILED', error: describePeerError(err) });
      }
    }
  }, [services]);

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

    const engine = services.createSender(conn, {
      onMetrics: ifCurrent((metrics) => dispatch({ type: 'METRICS', metrics })),
      onPaused: ifCurrent((isPaused) => dispatch({ type: 'PAUSED', isPaused })),
      onAllCompleted: ifCurrent((result) => {
        endTransfer(true);
        dispatch({ type: 'COMPLETED', result });
      }),
      onError: ifCurrent((error) => {
        endTransfer(false);
        connectionRef.current?.disconnectPeer();
        dispatch({ type: 'FAILED', error });
      }),
      onCancelled: ifCurrent(() => {
        endTransfer(false);
        connectionRef.current?.disconnectPeer();
        dispatch({ type: 'CANCELLED' });
      }),
    });
    engineRef.current = engine;
    services.effects.onTransferStarted();
    dispatch({ type: 'TRANSFER_STARTED' });
    engine.start(state.files, state.pin);
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
    engineRef.current = null;
    connectionRef.current?.disconnectPeer();
    dispatch({ type: 'FILES_CLEARED' });
  };

  return {
    state,
    actions: {
      addFiles: (files: File[]) => dispatch({ type: 'FILES_ADDED', files: files.map(toTransferFile) }),
      removeFile: (fileId: string) => dispatch({ type: 'FILE_REMOVED', fileId }),
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
