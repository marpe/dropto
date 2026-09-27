import type { SenderStatus, TransferFile, TransferMetrics, TransferResult } from '../types/transfer';
import type { PendingPeer, ReceiverStage, SenderReceiver, SharingOptions } from '../types/sharing';
import { recallMaxSimultaneous } from '../utils/sharingMemory';

export interface SenderSessionState {
  roomCode: string;
  /** Secret carried in the share link; receivers presenting it are admitted without asking */
  shareKey: string;
  /** Why the room could not be opened */
  roomError: string | null;
  /** Why the room code changed or the rules tightened, shown with the link */
  roomNotice: string | null;
  files: TransferFile[];
  options: SharingOptions;
  /** The sender has finished choosing and created the link; until then nobody is admitted */
  isShared: boolean;
  /** In arrival order; the approval prompt shows the first untrusted one */
  pendingPeers: PendingPeer[];
  /** Everyone let in during this share: waiting in line, downloading or finished */
  receivers: SenderReceiver[];
  /** Receivers let in so far in this share, for numbering them */
  arrivals: number;
}

export type SenderAction =
  | { type: 'ROOM_REQUESTED'; notice: string | null }
  | { type: 'ROOM_READY'; roomCode: string; shareKey: string }
  | { type: 'ROOM_FAILED'; error: string }
  | { type: 'ROOM_CLOSED' }
  | { type: 'LOCKED_DOWN'; notice: string }
  | { type: 'FILES_ADDED'; files: TransferFile[] }
  | { type: 'FILE_REMOVED'; fileId: string }
  | { type: 'QUEUE_EMPTIED' }
  | { type: 'FILES_CLEARED' }
  | { type: 'OPTIONS_CHANGED'; options: Partial<SharingOptions> }
  | { type: 'LINK_CREATED' }
  | { type: 'SHARE_ENDED' }
  | { type: 'PEER_REQUESTED'; peerId: string; isTrusted: boolean }
  | { type: 'PEER_ANSWERED'; peerId: string }
  | { type: 'PEER_DISCONNECTED'; peerId?: string }
  | { type: 'RECEIVER_QUEUED'; peerId: string }
  | { type: 'RECEIVER_ADMITTED'; peerId: string }
  | { type: 'RECEIVER_STARTED'; peerId: string; fileIndices: number[] }
  | { type: 'METRICS'; peerId: string; metrics: TransferMetrics }
  | { type: 'PAUSED'; peerId: string; isPaused: boolean }
  | { type: 'RECEIVER_COMPLETED'; peerId: string; result: TransferResult }
  | { type: 'RECEIVER_FAILED'; peerId: string; error: string }
  | { type: 'RECEIVER_REMOVED'; peerId: string }
  | { type: 'FINISHED_CLEARED' };

export function createInitialSenderState(): SenderSessionState {
  return {
    roomCode: '',
    shareKey: '',
    roomError: null,
    roomNotice: null,
    files: [],
    options: { pin: '', requireApproval: false, allowMultiple: false, maxSimultaneous: recallMaxSimultaneous() },
    isShared: false,
    pendingPeers: [],
    receivers: [],
    arrivals: 0,
  };
}

const FINISHED: ReceiverStage[] = ['completed', 'failed'];

function newReceiver(peerId: string, number: number, stage: ReceiverStage): SenderReceiver {
  return { peerId, number, stage, fileIndices: null, metrics: null, isPaused: false, error: null, corruptedFiles: [] };
}

function updateReceiver(
  state: SenderSessionState,
  peerId: string,
  update: (receiver: SenderReceiver) => SenderReceiver
): SenderSessionState {
  return {
    ...state,
    receivers: state.receivers.map((receiver) => (receiver.peerId === peerId ? update(receiver) : receiver)),
  };
}

function admitReceiver(state: SenderSessionState, peerId: string): SenderSessionState {
  if (state.receivers.some((receiver) => receiver.peerId === peerId)) {
    return updateReceiver(state, peerId, (receiver) => ({ ...receiver, stage: 'choosing' }));
  }
  // With one person at a time, a new attempt replaces the previous failed one on screen
  const kept = state.options.allowMultiple
    ? state.receivers
    : state.receivers.filter((receiver) => receiver.stage !== 'failed');
  return {
    ...state,
    receivers: [...kept, newReceiver(peerId, state.arrivals + 1, 'choosing')],
    arrivals: state.arrivals + 1,
  };
}

// Leaving the room forgets everyone in it; the next room starts counting again
const emptyRoom: Pick<SenderSessionState, 'pendingPeers' | 'receivers' | 'arrivals'> = {
  pendingPeers: [],
  receivers: [],
  arrivals: 0,
};

export function senderReducer(state: SenderSessionState, action: SenderAction): SenderSessionState {
  switch (action.type) {
    case 'ROOM_REQUESTED':
      return { ...state, ...emptyRoom, roomCode: '', shareKey: '', roomError: null, roomNotice: action.notice };
    case 'ROOM_READY':
      return { ...state, roomCode: action.roomCode, shareKey: action.shareKey };
    case 'ROOM_FAILED':
      return { ...state, roomError: action.error };
    case 'ROOM_CLOSED':
      return { ...state, ...emptyRoom, roomCode: '', shareKey: '', roomError: null, isShared: false };
    case 'LOCKED_DOWN':
      return { ...state, options: { ...state.options, requireApproval: true }, roomNotice: action.notice };
    case 'FILES_ADDED':
      return { ...state, files: [...state.files, ...action.files] };
    case 'FILE_REMOVED':
      return { ...state, files: state.files.filter((file) => file.id !== action.fileId) };
    case 'QUEUE_EMPTIED':
      return { ...state, files: [] };
    case 'FILES_CLEARED':
      return { ...state, files: [], receivers: [], arrivals: 0, isShared: false };
    case 'OPTIONS_CHANGED':
      return { ...state, options: { ...state.options, ...action.options } };
    case 'LINK_CREATED':
      return { ...state, isShared: true };
    case 'SHARE_ENDED':
      return { ...state, receivers: [], arrivals: 0, isShared: false };
    case 'PEER_REQUESTED':
      return { ...state, pendingPeers: [...state.pendingPeers, { peerId: action.peerId, isTrusted: action.isTrusted }] };
    case 'PEER_ANSWERED':
      return { ...state, pendingPeers: state.pendingPeers.filter((peer) => peer.peerId !== action.peerId) };
    case 'PEER_DISCONNECTED': {
      // Only people not yet downloading are dropped here; a transfer reports its own end
      const isGone = (peerId: string) => !action.peerId || peerId === action.peerId;
      return {
        ...state,
        pendingPeers: state.pendingPeers.filter((peer) => !isGone(peer.peerId)),
        receivers: state.receivers.filter((receiver) => receiver.stage !== 'queued' || !isGone(receiver.peerId)),
      };
    }
    case 'RECEIVER_QUEUED':
      return {
        ...state,
        receivers: [...state.receivers, newReceiver(action.peerId, state.arrivals + 1, 'queued')],
        arrivals: state.arrivals + 1,
      };
    case 'RECEIVER_ADMITTED':
      return admitReceiver(state, action.peerId);
    case 'RECEIVER_STARTED':
      return updateReceiver(state, action.peerId, (receiver) =>
        receiver.stage === 'choosing' ? { ...receiver, stage: 'transferring', fileIndices: action.fileIndices } : receiver
      );
    case 'METRICS':
      return updateReceiver(state, action.peerId, (receiver) => ({ ...receiver, metrics: action.metrics }));
    case 'PAUSED':
      return updateReceiver(state, action.peerId, (receiver) => ({ ...receiver, isPaused: action.isPaused }));
    case 'RECEIVER_COMPLETED':
      return updateReceiver(state, action.peerId, (receiver) => ({
        ...receiver,
        stage: 'completed',
        isPaused: false,
        corruptedFiles: action.result.corruptedFiles,
      }));
    case 'RECEIVER_FAILED':
      return updateReceiver(state, action.peerId, (receiver) => ({
        ...receiver,
        stage: 'failed',
        metrics: null,
        isPaused: false,
        error: action.error,
      }));
    case 'RECEIVER_REMOVED':
      return { ...state, receivers: state.receivers.filter((receiver) => receiver.peerId !== action.peerId) };
    case 'FINISHED_CLEARED':
      return { ...state, receivers: state.receivers.filter((receiver) => !FINISHED.includes(receiver.stage)) };
  }
}

const STATUS_BY_STAGE: Record<ReceiverStage, SenderStatus> = {
  queued: 'waiting',
  choosing: 'awaiting_receiver',
  transferring: 'transferring',
  completed: 'completed',
  failed: 'failed',
};

/**
 * The receiver a one-person share is about, shown full screen. Sharing with several people keeps
 * the link on screen and lists everyone instead, so there is no single focus.
 */
export function selectFocusReceiver(state: SenderSessionState): SenderReceiver | null {
  if (state.options.allowMultiple) {
    return null;
  }
  return state.receivers.at(-1) ?? null;
}

export function selectSenderStatus(state: SenderSessionState): SenderStatus {
  const focus = selectFocusReceiver(state);
  return focus ? STATUS_BY_STAGE[focus.stage] : 'waiting';
}

/** Receivers holding a download slot: choosing where to save or downloading. */
export function countActiveReceivers(receivers: SenderReceiver[]): number {
  return receivers.filter((receiver) => receiver.stage === 'choosing' || receiver.stage === 'transferring').length;
}
