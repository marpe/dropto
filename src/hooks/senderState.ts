import type { ManifestFile, SenderStatus, TransferFile, TransferMetrics, TransferResult } from '../types/transfer';
import type { PeerDetails, PendingPeer, ReceiverStage, SenderReceiver, SharingOptions } from '../types/sharing';
import { DEFAULT_SIMULTANEOUS } from '../utils/sharingLimits';
import { fileIdentity } from '../utils/fileMemory';
import { pickFiles } from '../utils/fileSelection';
import { finishedFilesOf } from '../utils/transferProgress';

export interface SenderSessionState {
  roomCode: string;
  /** Secret carried in the share link; receivers presenting it are admitted without asking */
  shareKey: string;
  /** Why the room could not be opened */
  roomError: string | null;
  /** Why the room code changed or the rules tightened, shown with the link */
  roomNotice: string | null;
  files: TransferFile[];
  /** Files listed before a reload, which the browser could not keep; adding the same file again restores it */
  missingFiles: ManifestFile[];
  options: SharingOptions;
  /** The sender has finished choosing and created the link; until then nobody is admitted */
  isShared: boolean;
  /** In arrival order; the approval prompt shows the first untrusted one */
  pendingPeers: PendingPeer[];
  /** Everyone let in during this share: waiting in line, downloading or finished */
  receivers: SenderReceiver[];
}

export const CONNECTION_LOST_MESSAGE = 'Connection lost';

export type SenderAction =
  | { type: 'ROOM_REQUESTED'; notice: string | null }
  | { type: 'ROOM_READY'; roomCode: string; shareKey: string; wasShared: boolean }
  | { type: 'ROOM_FAILED'; error: string }
  | { type: 'ROOM_CLOSED' }
  | { type: 'LOCKED_DOWN'; notice: string }
  | { type: 'FILES_ADDED'; files: TransferFile[] }
  | { type: 'FILES_REMOVED'; fileIds: string[] }
  | { type: 'QUEUE_EMPTIED' }
  | { type: 'FILES_CLEARED' }
  | { type: 'OPTIONS_CHANGED'; options: Partial<SharingOptions> }
  | { type: 'LINK_CREATED' }
  | { type: 'SHARE_ENDED' }
  | { type: 'PEER_REQUESTED'; peerId: string; isTrusted: boolean; details: PeerDetails }
  | { type: 'PEER_ADDRESS'; peerId: string; ip: string | null; route: 'direct' | 'relayed' }
  | { type: 'PEER_ANSWERED'; peerId: string }
  | { type: 'PEER_DISCONNECTED'; peerId?: string }
  | { type: 'RECEIVER_QUEUED'; peerId: string }
  | { type: 'RECEIVER_ADMITTED'; peerId: string; details: PeerDetails; atMs: number }
  | { type: 'RECEIVER_RESUMED'; fromPeerId: string; peerId: string }
  | { type: 'RECEIVER_STARTED'; peerId: string; fileIndices: number[]; startBytes: number }
  | { type: 'METRICS'; peerId: string; metrics: TransferMetrics }
  | { type: 'PAUSED'; peerId: string; isPaused: boolean }
  | { type: 'RECEIVER_COMPLETED'; peerId: string; result: TransferResult; atMs: number }
  | { type: 'RECEIVER_INTERRUPTED'; peerId: string; finishedCount: number; corruptedFiles: string[] }
  | { type: 'RECEIVER_FAILED'; peerId: string; error: string }
  | { type: 'RECEIVER_REMOVED'; peerId: string }
  | { type: 'RECEIVER_LEFT'; peerId: string };

export function createInitialSenderState(): SenderSessionState {
  return {
    roomCode: '',
    shareKey: '',
    roomError: null,
    roomNotice: null,
    files: [],
    missingFiles: [],
    options: { pin: '', requireApproval: false, maxSimultaneous: DEFAULT_SIMULTANEOUS },
    isShared: false,
    pendingPeers: [],
    receivers: [],
  };
}

function newReceiver(peerId: string, details: PeerDetails, stage: ReceiverStage, idleSinceMs: number): SenderReceiver {
  return {
    peerId,
    details,
    stage,
    idleSinceMs,
    hasLeft: false,
    downloadFiles: [],
    sentFiles: [],
    finishedFiles: {},
    bytesSent: 0,
    downloadStartBytes: 0,
    metrics: null,
    isPaused: false,
    error: null,
  };
}

/** What went over the connection in the running download, beyond what an earlier cut-off one already counted. */
function downloadBytesSent(receiver: SenderReceiver): number {
  return Math.max((receiver.metrics?.bytesTransferred ?? 0) - receiver.downloadStartBytes, 0);
}

function withSentFiles(receiver: SenderReceiver, files: ManifestFile[]): ManifestFile[] {
  const sentIds = new Set(receiver.sentFiles.map((file) => file.id));
  return [...receiver.sentFiles, ...files.filter((file) => !sentIds.has(file.id))];
}

function completeDownload(receiver: SenderReceiver, result: TransferResult, atMs: number): SenderReceiver {
  const downloadBytes = receiver.downloadFiles.reduce((sum, file) => sum + file.size, 0);
  return {
    ...receiver,
    stage: 'completed',
    idleSinceMs: atMs,
    isPaused: false,
    bytesSent: receiver.bytesSent + downloadBytes - receiver.downloadStartBytes,
    sentFiles: withSentFiles(receiver, receiver.downloadFiles),
    finishedFiles: { ...receiver.finishedFiles, ...finishedFilesOf(receiver.downloadFiles, receiver.metrics, result) },
  };
}

/** Cut off mid-download: what went over counts as sent, and the files finished before the cut as downloaded. */
function interruptDownload(receiver: SenderReceiver, finishedCount: number, corruptedFiles: string[]): SenderReceiver {
  const finished = receiver.downloadFiles.slice(0, finishedCount);
  return {
    ...receiver,
    stage: 'interrupted',
    idleSinceMs: null,
    isPaused: false,
    bytesSent: receiver.bytesSent + downloadBytesSent(receiver),
    sentFiles: withSentFiles(receiver, finished),
    finishedFiles: { ...receiver.finishedFiles, ...finishedFilesOf(finished, receiver.metrics, { corruptedFiles }) },
  };
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

function admitReceiver(state: SenderSessionState, peerId: string, details: PeerDetails, atMs: number): SenderSessionState {
  if (state.receivers.some((receiver) => receiver.peerId === peerId)) {
    return updateReceiver(state, peerId, (receiver) => ({ ...receiver, details, stage: 'choosing', idleSinceMs: atMs }));
  }
  return { ...state, receivers: [...state.receivers, newReceiver(peerId, details, 'choosing', atMs)] };
}

/** Someone back on a new connection keeps their place in the list and what they downloaded, not how it ended. */
function resumeReceiver(state: SenderSessionState, fromPeerId: string, peerId: string): SenderSessionState {
  return updateReceiver(state, fromPeerId, (receiver) => ({
    ...receiver,
    peerId,
    hasLeft: false,
    metrics: null,
    isPaused: false,
    error: null,
  }));
}

/**
 * Adds files not already listed (the same file picked twice counts once). A file listed before a reload takes
 * its old id back and leaves the missing list, so receivers' records of it still match.
 */
function addFiles(state: SenderSessionState, incoming: TransferFile[]): SenderSessionState {
  const known = new Set(state.files.map(fileIdentity));
  const missingIds = new Map(state.missingFiles.map((file) => [fileIdentity(file), file.id]));
  const added = incoming.flatMap((file) => {
    const identity = fileIdentity(file);
    if (known.has(identity)) {
      return [];
    }
    known.add(identity);
    return [{ ...file, id: missingIds.get(identity) ?? file.id }];
  });
  if (added.length === 0) {
    return state;
  }
  const restored = new Set(added.map((file) => file.id));
  return {
    ...state,
    files: [...state.files, ...added],
    missingFiles: state.missingFiles.filter((file) => !restored.has(file.id)),
  };
}

// Leaving the room forgets everyone in it; the next room starts counting again
const emptyRoom: Pick<SenderSessionState, 'pendingPeers' | 'receivers'> = { pendingPeers: [], receivers: [] };

export function senderReducer(state: SenderSessionState, action: SenderAction): SenderSessionState {
  switch (action.type) {
    case 'ROOM_REQUESTED':
      return { ...state, ...emptyRoom, roomCode: '', shareKey: '', roomError: null, roomNotice: action.notice };
    case 'ROOM_READY':
      // A reload keeps a link that was already out: it shows again, and people holding it are let in with files
      return { ...state, roomCode: action.roomCode, shareKey: action.shareKey, isShared: state.isShared || action.wasShared };
    case 'ROOM_FAILED':
      return { ...state, roomError: action.error };
    case 'ROOM_CLOSED':
      return { ...state, ...emptyRoom, roomCode: '', shareKey: '', roomError: null, isShared: false };
    case 'LOCKED_DOWN':
      return { ...state, options: { ...state.options, requireApproval: true }, roomNotice: action.notice };
    case 'FILES_ADDED':
      return addFiles(state, action.files);
    case 'FILES_REMOVED': {
      const removed = new Set(action.fileIds);
      return {
        ...state,
        files: state.files.filter((file) => !removed.has(file.id)),
        missingFiles: state.missingFiles.filter((file) => !removed.has(file.id)),
      };
    }
    case 'QUEUE_EMPTIED':
      return { ...state, files: [], missingFiles: [] };
    case 'FILES_CLEARED':
      return { ...state, files: [], missingFiles: [], receivers: [], isShared: false };
    case 'OPTIONS_CHANGED':
      return { ...state, options: { ...state.options, ...action.options } };
    case 'LINK_CREATED':
      return { ...state, isShared: true };
    case 'SHARE_ENDED':
      return { ...state, receivers: [], isShared: false };
    case 'PEER_REQUESTED':
      return {
        ...state,
        pendingPeers: [...state.pendingPeers, { peerId: action.peerId, isTrusted: action.isTrusted, details: action.details }],
      };
    case 'PEER_ADDRESS': {
      const withIp = <T extends { peerId: string; details: PeerDetails }>(item: T): T =>
        item.peerId === action.peerId ? { ...item, details: { ...item.details, ip: action.ip, route: action.route } } : item;
      return { ...state, pendingPeers: state.pendingPeers.map(withIp), receivers: state.receivers.map(withIp) };
    }
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
      // A download started while every slot is taken waits in line; the person keeps their place in the list
      return updateReceiver(state, action.peerId, (receiver) => ({ ...receiver, stage: 'queued', idleSinceMs: null }));
    case 'RECEIVER_ADMITTED':
      return admitReceiver(state, action.peerId, action.details, action.atMs);
    case 'RECEIVER_RESUMED':
      return resumeReceiver(state, action.fromPeerId, action.peerId);
    case 'RECEIVER_STARTED':
      // The first download, or another one by someone still connected after finishing
      return updateReceiver(state, action.peerId, (receiver) =>
        receiver.stage === 'failed'
          ? receiver
          : {
              ...receiver,
              stage: 'transferring',
              idleSinceMs: null,
              // A snapshot: the sender may change its list while this download runs
              downloadFiles: pickFiles(state.files, action.fileIndices),
              downloadStartBytes: action.startBytes,
              metrics: null,
            }
      );
    case 'METRICS':
      return updateReceiver(state, action.peerId, (receiver) => ({ ...receiver, metrics: action.metrics }));
    case 'PAUSED':
      return updateReceiver(state, action.peerId, (receiver) => ({ ...receiver, isPaused: action.isPaused }));
    case 'RECEIVER_COMPLETED':
      return updateReceiver(state, action.peerId, (receiver) => completeDownload(receiver, action.result, action.atMs));
    case 'RECEIVER_INTERRUPTED':
      return updateReceiver(state, action.peerId, (receiver) =>
        interruptDownload(receiver, action.finishedCount, action.corruptedFiles)
      );
    case 'RECEIVER_FAILED':
      return updateReceiver(state, action.peerId, (receiver) => ({
        ...receiver,
        stage: 'failed',
        idleSinceMs: null,
        // A cut-off download already counted what got through
        bytesSent: receiver.bytesSent + (receiver.stage === 'interrupted' ? 0 : downloadBytesSent(receiver)),
        metrics: null,
        isPaused: false,
        error: action.error,
      }));
    case 'RECEIVER_REMOVED':
      return { ...state, receivers: state.receivers.filter((receiver) => receiver.peerId !== action.peerId) };
    case 'RECEIVER_LEFT':
      // Someone who finished stays listed with what they downloaded; anyone else leaving just drops off
      return {
        ...state,
        receivers: state.receivers.flatMap((receiver) => {
          if (receiver.peerId !== action.peerId) {
            return [receiver];
          }
          return receiver.stage === 'completed' ? [{ ...receiver, hasLeft: true, idleSinceMs: null }] : [];
        }),
      };
  }
}

const STATUS_BY_STAGE: Record<ReceiverStage, SenderStatus> = {
  queued: 'waiting',
  choosing: 'awaiting_receiver',
  transferring: 'transferring',
  interrupted: 'transferring',
  completed: 'completed',
  failed: 'failed',
};

/** The only person on the link, which the tab title and leave guard follow; null with nobody or several. */
export function selectFocusReceiver(state: SenderSessionState): SenderReceiver | null {
  return state.receivers.length === 1 ? state.receivers[0] : null;
}

export function selectSenderStatus(state: SenderSessionState): SenderStatus {
  const focus = selectFocusReceiver(state);
  return focus ? STATUS_BY_STAGE[focus.stage] : 'waiting';
}

/** Receivers holding a download slot: choosing where to save or downloading. */
export function countActiveReceivers(receivers: SenderReceiver[]): number {
  return receivers.filter(
    (receiver) => receiver.stage === 'choosing' || receiver.stage === 'transferring' || receiver.stage === 'interrupted'
  ).length;
}

/** Everyone still on the link, whatever they are doing: those who left or failed are only listed. */
export function countConnectedReceivers(receivers: SenderReceiver[]): number {
  return receivers.filter((receiver) => !receiver.hasLeft && receiver.stage !== 'failed').length;
}

/** Someone connected and not downloading may be looking at the file list, so changing it changes what they see. */
export function isAnyoneBrowsing(receivers: SenderReceiver[]): boolean {
  return receivers.some((receiver) => receiver.idleSinceMs !== null);
}
