import { pickFiles } from '../utils/fileSelection';
import { finishedFilesOf } from '../utils/transferProgress';
import type { ShareLink } from '../utils/shareLink';
import type {
  FinishedFile,
  PinPrompt,
  ReceiverStatus,
  TransferManifest,
  TransferMetrics,
  TransferResult,
} from '../types/transfer';

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
  /** Place in the sender's line while a download waits for a free slot; 1 means next */
  queuePosition: number | null;
  manifest: TransferManifest | null;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
  corruptedFiles: string[];
  /** Files downloaded so far on this connection, by file id; a finished download stays connected for more */
  finishedFiles: Record<string, FinishedFile>;
  /** The sender went away after a finished download; the list stays, but nothing more can be downloaded */
  hasSenderLeft: boolean;
  /** A download cut off by a dropped connection, waiting for the sender to be back so it can carry on */
  isInterrupted: boolean;
  /** A cut-off download could not carry on; the list offers what is still missing */
  hasInterruptedDownload: boolean;
}

export type ReceiverAction =
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
  | { type: 'RECONNECTING' }
  | { type: 'SAVING_STARTED'; fileIndices: number[] | null }
  | { type: 'SAVING_ABORTED' }
  | { type: 'METRICS'; metrics: TransferMetrics }
  | { type: 'PAUSED'; isPaused: boolean }
  | { type: 'COMPLETED'; result: TransferResult }
  | { type: 'FAILED'; error: string }
  | { type: 'CANCELLED' }
  | { type: 'RESET' }
  | { type: 'DOWNLOAD_INTERRUPTED'; finishedCount: number; corruptedFiles: string[] }
  | { type: 'DOWNLOAD_RESUMED'; fileIndices: number[] }
  | { type: 'RESUME_FAILED' };

const noProgress = { metrics: null, isPaused: false } as const;

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
  finishedFiles: {},
  hasSenderLeft: false,
  isInterrupted: false,
  hasInterruptedDownload: false,
};

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
        finishedFiles: {},
        hasSenderLeft: false,
        isInterrupted: false,
        hasInterruptedDownload: false,
      };
    case 'CONNECTED':
      // Back to carry on a cut-off download: it stays on screen
      return state.isInterrupted
        ? { ...state, isInvited: action.isInvited }
        : { ...state, status: 'waiting_approval', isInvited: action.isInvited };
    case 'CONNECT_FAILED':
      return { ...state, status: 'error', error: action.error, isInterrupted: false, hasInterruptedDownload: false };
    case 'QUEUED':
      // Only a download waits for a slot, so the place in line shows within it
      return state.status === 'transferring' ? { ...state, queuePosition: action.position } : state;
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
      return {
        ...state,
        // After a finished download the sender may still change the list; it stays on the finished screen
        status: state.status === 'completed' ? 'completed' : state.isInterrupted ? 'transferring' : 'connected',
        manifest: action.manifest,
        pinPrompt: null,
        queuePosition: null,
        hasSenderLeft: false,
      };
    case 'RECONNECTING':
      return { ...state, ...noProgress, status: 'reconnecting', manifest: null, pinPrompt: null, queuePosition: null };
    case 'SAVING_STARTED':
      return {
        ...state,
        ...noProgress,
        status: 'transferring',
        selectedFileIndices: action.fileIndices,
        queuePosition: null,
        corruptedFiles: [],
        hasInterruptedDownload: false,
      };
    case 'SAVING_ABORTED':
      return { ...state, status: 'connected' };
    case 'METRICS':
      return { ...state, metrics: action.metrics, queuePosition: null };
    case 'PAUSED':
      return { ...state, isPaused: action.isPaused };
    case 'COMPLETED':
      return {
        ...state,
        status: 'completed',
        isPaused: false,
        queuePosition: null,
        corruptedFiles: action.result.corruptedFiles,
        finishedFiles: {
          ...state.finishedFiles,
          ...finishedFilesOf(pickFiles(state.manifest?.files ?? [], state.selectedFileIndices), state.metrics, action.result),
        },
      };
    case 'FAILED':
      // Stopped by the sender after a finished download: what was downloaded stays listed
      if (state.status === 'completed') {
        return { ...state, hasSenderLeft: true };
      }
      return {
        ...state,
        ...noProgress,
        status: 'error',
        error: action.error,
        manifest: null,
        isInterrupted: false,
        hasInterruptedDownload: false,
      };
    case 'CANCELLED':
      return {
        ...state,
        ...noProgress,
        status: 'idle',
        error: null,
        manifest: null,
        isInterrupted: false,
        hasInterruptedDownload: false,
      };
    case 'RESET':
      return { ...initialReceiverState, roomCode: state.roomCode, link: state.link };
    case 'DOWNLOAD_INTERRUPTED':
      return {
        ...state,
        isInterrupted: true,
        isPaused: false,
        queuePosition: null,
        finishedFiles: {
          ...state.finishedFiles,
          ...finishedFilesOf(
            pickFiles(state.manifest?.files ?? [], state.selectedFileIndices).slice(0, action.finishedCount),
            state.metrics,
            { corruptedFiles: action.corruptedFiles }
          ),
        },
      };
    case 'DOWNLOAD_RESUMED':
      return {
        ...state,
        ...noProgress,
        status: 'transferring',
        isInterrupted: false,
        selectedFileIndices: action.fileIndices,
        queuePosition: null,
        corruptedFiles: [],
      };
    case 'RESUME_FAILED':
      return { ...state, ...noProgress, status: 'connected', isInterrupted: false, hasInterruptedDownload: true, queuePosition: null };
  }
}
