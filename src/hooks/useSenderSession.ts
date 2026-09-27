import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { DataConnection } from 'peerjs';
import { soundService } from '../services/sound';
import { describePeerError } from '../services/peerErrors';
import type { AppSettings, SenderStatus, TransferFile, TransferMetrics, TransferResult } from '../types/transfer';
import { generateShareKey } from '../utils/shareLink';
import { displayPath } from '../utils/filePath';
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
  /** Even receivers with the link key must be accepted by hand */
  requireApproval: boolean;
  /** The sender has finished choosing and created the link; until then nobody is admitted */
  isShared: boolean;
  pendingPeerId: string | null;
  /** The pending receiver may be admitted without asking (valid link key, approval not required) once shared */
  isPendingPeerTrusted: boolean;
  connectedPeerId: string | null;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
  corruptedFiles: string[];
  /** Files the receiver chose to download (indices into `files`); null until it starts */
  receiverFileIndices: number[] | null;
  /** Receivers locked out by wrong PINs in the current room */
  pinLockouts: number;
  /** Why the room code changed, shown with the new code */
  roomNotice: string | null;
}

type SenderAction =
  | { type: 'ROOM_REQUESTED'; notice: string | null }
  | { type: 'ROOM_READY'; roomCode: string; shareKey: string }
  | { type: 'ROOM_FAILED'; error: string }
  | { type: 'ROOM_CLOSED' }
  | { type: 'FILES_ADDED'; files: TransferFile[] }
  | { type: 'FILE_REMOVED'; fileId: string }
  | { type: 'FILES_CLEARED' }
  | { type: 'QUEUE_EMPTIED' }
  | { type: 'PIN_CHANGED'; pin: string }
  | { type: 'APPROVAL_REQUIREMENT_CHANGED'; requireApproval: boolean }
  | { type: 'LINK_CREATED' }
  | { type: 'PEER_REQUESTED'; peerId: string; isTrusted: boolean }
  | { type: 'PEER_REJECTED' }
  | { type: 'PEER_DISCONNECTED'; peerId?: string }
  | { type: 'TRANSFER_STARTED'; peerId: string }
  | { type: 'RECEIVER_STARTED'; fileIndices: number[] }
  | { type: 'PIN_LOCKOUT' }
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
  requireApproval: false,
  isShared: false,
  pendingPeerId: null,
  isPendingPeerTrusted: false,
  connectedPeerId: null,
  metrics: null,
  isPaused: false,
  error: null,
  corruptedFiles: [],
  receiverFileIndices: null,
  pinLockouts: 0,
  roomNotice: null,
};

// Three attempts per connection, three connections: then the code is replaced
const MAX_PIN_LOCKOUTS_PER_ROOM = 3;
const PIN_LOCKOUT_NOTICE =
  'Someone entered a wrong PIN too many times, so this is a new room. Share the new code or link.';

// Per-transfer progress, cleared whenever a transfer starts or ends
const noProgress = { metrics: null, isPaused: false } as const;

export function senderReducer(state: SenderSessionState, action: SenderAction): SenderSessionState {
  switch (action.type) {
    case 'ROOM_REQUESTED':
      return {
        ...state,
        status: 'waiting',
        roomCode: '',
        shareKey: '',
        error: null,
        pinLockouts: 0,
        roomNotice: action.notice,
      };
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
        isShared: false,
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
      return {
        ...state,
        ...noProgress,
        files: [],
        status: 'waiting',
        connectedPeerId: null,
        corruptedFiles: [],
        isShared: false,
      };
    case 'QUEUE_EMPTIED':
      return { ...state, files: [] };
    case 'PIN_CHANGED':
      return { ...state, pin: action.pin };
    case 'APPROVAL_REQUIREMENT_CHANGED':
      return { ...state, requireApproval: action.requireApproval };
    case 'LINK_CREATED':
      return { ...state, isShared: true };
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
        receiverFileIndices: null,
        connectedPeerId: action.peerId,
        pendingPeerId: null,
        isPendingPeerTrusted: false,
        error: null,
        corruptedFiles: [],
      };
    case 'PIN_LOCKOUT':
      return { ...state, pinLockouts: state.pinLockouts + 1 };
    case 'RECEIVER_STARTED':
      return state.status === 'awaiting_receiver'
        ? { ...state, status: 'transferring', receiverFileIndices: action.fileIndices }
        : state;
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

/** Same path, size and modification time: the same file picked or dropped twice. */
function fileIdentity(file: TransferFile): string {
  return `${displayPath(file)}|${file.size}|${file.lastModified}`;
}

export interface SharingOptions {
  pin: string;
  requireApproval: boolean;
}

interface OpenRoomOptions {
  /** Never reuse the remembered room, so its code and link stop working */
  isFresh?: boolean;
  notice?: string | null;
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
  const queueRef = useRef({
    files: state.files,
    pin: state.pin,
    isShared: state.isShared,
    requireApproval: state.requireApproval,
  });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    queueRef.current = {
      files: state.files,
      pin: state.pin,
      isShared: state.isShared,
      requireApproval: state.requireApproval,
    };
  }, [state.files, state.pin, state.isShared, state.requireApproval]);

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
        onPinLockout: ifCurrent(() => dispatch({ type: 'PIN_LOCKOUT' })),
        onReceiverStarted: ifCurrent((fileIndices) => {
          hasReceiverStarted = true;
          dispatch({ type: 'RECEIVER_STARTED', fileIndices });
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

  const openRoom = useCallback(async ({ isFresh = false, notice = null }: OpenRoomOptions = {}) => {
    connectionRef.current?.destroy();
    engineRef.current = null;
    pendingConnRef.current = null;
    shareKeyRef.current = null;
    dispatch({ type: 'ROOM_REQUESTED', notice });

    const connection = services.createConnection({
      onIncomingConnection: (conn, greeting) => {
        if (connectionRef.current !== connection) {
          return;
        }
        soundService.playConnect();
        const { files, pin, isShared, requireApproval } = queueRef.current;
        const hasLinkKey = greeting.shareKey !== null && greeting.shareKey === shareKeyRef.current;
        const isAdmittable = hasLinkKey && !requireApproval;
        if (isAdmittable && isShared && files.length > 0) {
          startTransfer(conn, files, pin);
          return;
        }
        // Held until the link exists and files are queued, or (without the key) until approved
        pendingConnRef.current = conn;
        dispatch({ type: 'PEER_REQUESTED', peerId: conn.peer, isTrusted: isAdmittable });
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
      const remembered = isFresh ? null : recallRoom();
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

  useEffect(() => {
    if (state.pinLockouts >= MAX_PIN_LOCKOUTS_PER_ROOM) {
      openRoom({ isFresh: true, notice: PIN_LOCKOUT_NOTICE });
    }
  }, [state.pinLockouts, openRoom]);

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
    admitHeldReceiver(files, state.isShared);
  };

  /** A link receiver that arrived early is admitted once the link exists and there is something to send. */
  const admitHeldReceiver = (files: TransferFile[], isShared: boolean) => {
    const conn = pendingConnRef.current;
    if (conn && state.isPendingPeerTrusted && isShared && files.length > 0) {
      pendingConnRef.current = null;
      startTransfer(conn, files, state.pin);
    }
  };

  const createLink = () => {
    if (state.files.length === 0) {
      return;
    }
    dispatch({ type: 'LINK_CREATED' });
    admitHeldReceiver(state.files, true);
  };

  /**
   * Changes the sharing options once the link is out. PIN and approval are checked when someone connects,
   * so 'new' leaves current receivers alone; 'now' stops the current transfer so it has to reconnect.
   */
  const updateSharing = ({ pin, requireApproval }: SharingOptions, applyTo: 'new' | 'now') => {
    dispatch({ type: 'PIN_CHANGED', pin });
    dispatch({ type: 'APPROVAL_REQUIREMENT_CHANGED', requireApproval });
    if (applyTo === 'now' && engineRef.current) {
      cancel();
    }
  };

  const addFiles = (rawFiles: File[]) => {
    const known = new Set(state.files.map(fileIdentity));
    const added = rawFiles.map(toTransferFile).filter((file) => {
      const identity = fileIdentity(file);
      if (known.has(identity)) {
        return false;
      }
      known.add(identity);
      return true;
    });
    if (added.length === 0) {
      return;
    }
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
    // A new batch gets a new link: whoever had the old one must not be let into the next share
    if (state.isShared) {
      openRoom({ isFresh: true });
    }
  };

  return {
    state,
    actions: {
      addFiles,
      removeFile,
      clearFiles,
      setPin: (pin: string) => dispatch({ type: 'PIN_CHANGED', pin }),
      setRequireApproval: (requireApproval: boolean) =>
        dispatch({ type: 'APPROVAL_REQUIREMENT_CHANGED', requireApproval }),
      createLink,
      updateSharing,
      approvePeer,
      rejectPeer,
      togglePause: () => engineRef.current?.togglePause(),
      cancel,
      dismissError: () => dispatch({ type: 'ERROR_DISMISSED' }),
      retryRoom: () => openRoom(),
    },
  };
}
