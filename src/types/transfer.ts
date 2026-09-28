/** A file queued on the sender. */
export interface TransferFile {
  id: string;
  name: string;
  size: number;
  type: string;
  relativePath?: string;
  lastModified?: number;
  rawFile: File;
}

/** What the receiver learns about each file (no file contents). */
export type ManifestFile = Omit<TransferFile, 'rawFile'>;

/** Enough of a file to name it in the UI or in a corruption report. */
export type NamedFile = Pick<ManifestFile, 'name' | 'relativePath'>;

export interface TransferManifest {
  totalBytes: number;
  files: ManifestFile[];
}

/** What a one-person share shows full screen; 'waiting' covers everything before someone is let in. */
export type SenderStatus = 'waiting' | 'awaiting_receiver' | 'transferring' | 'completed' | 'failed';

export type ReceiverStatus =
  | 'idle'
  | 'connecting'
  | 'reconnecting'
  | 'waiting_approval'
  | 'pin_required'
  | 'verifying_pin'
  | 'connected'
  | 'transferring'
  | 'completed'
  | 'error';

export interface PinPrompt {
  attemptsLeft: number;
  /** True when the previous attempt was wrong */
  isIncorrect: boolean;
}

export interface TransferResult {
  /** Paths of files whose end-to-end checksum did not match */
  corruptedFiles: string[];
}

/** The receiver's introduction: the link key it holds, plus optional details that label it on the sender's side. */
export interface HelloPayload {
  shareKey: string | null;
  /** e.g. "Chrome on Android" */
  device?: string;
  /** IANA time zone, a rough self-reported location */
  timeZone?: string;
  /** Random per browser tab, kept across reloads, so the sender recognises someone reconnecting */
  sessionId?: string;
  formFactor?: FormFactor;
  /** e.g. "Pixel 8"; only Chromium on Android tells */
  model?: string;
  storage?: StorageMode;
}

export type FormFactor = 'phone' | 'tablet' | 'desktop';

/** Where a receiver's downloads go: streamed to disk, or held in memory until done (Firefox, Safari) */
export type StorageMode = 'disk' | 'memory';

/** JSON control messages; file data travels separately as binary chunks. */
export type ControlMessage =
  | { type: 'HELLO'; payload: HelloPayload }
  | { type: 'AUTH_REQUEST'; payload: PinPrompt }
  | { type: 'AUTH_RESPONSE'; payload: { pin: string } }
  | { type: 'MANIFEST'; payload: TransferManifest }
  | { type: 'FILE_SELECTION'; payload: { fileIndices: number[] } }
  | { type: 'FILE_START'; payload: { fileIndex: number } }
  | { type: 'FILE_COMPLETE'; payload: { fileIndex: number; checksum: string } }
  | { type: 'FILE_ACK'; payload: { fileIndex: number; isVerified: boolean } }
  | { type: 'TRANSFER_PAUSE' }
  | { type: 'TRANSFER_RESUME' }
  | { type: 'TRANSFER_CANCEL' }
  | { type: 'ERROR'; payload: { message: string } }
  /** Sender to a receiver waiting for a free download slot; 1 means next */
  | { type: 'QUEUED'; payload: { position: number } };

export type ControlMessageType = ControlMessage['type'];

export interface TransferMetrics {
  /** Bytes per second over the recent window */
  currentSpeed: number;
  averageSpeed: number;
  /** Since the first byte moved */
  elapsedSeconds: number;
  etaSeconds: number;
  bytesTransferred: number;
  totalBytes: number;
  overallPercent: number;
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  currentFilePercent: number;
  /** Seconds from each file's first byte to its last, by position in the transfer; kept once a file is done */
  fileSeconds: number[];
}

/** Events a transfer reports to the UI; shared by the sender and receiver. */
/** A file this receiver has downloaded on the current connection. */
export interface FinishedFile {
  /** How long it took; null when too quick to measure */
  seconds: number | null;
  isCorrupted: boolean;
}

export interface TransferEvents {
  onMetrics?: (metrics: TransferMetrics) => void;
  onFileComplete?: (fileIndex: number, isVerified: boolean) => void;
  /** One download finished; the connection stays open, so the receiver can download again */
  onAllCompleted?: (result: TransferResult) => void;
  onError?: (message: string) => void;
  onPaused?: (isPaused: boolean) => void;
  onCancelled?: () => void;
  /** The connection dropped mid-transfer; when provided it replaces the generic onError for that case */
  onConnectionLost?: () => void;
  /** The connection closed while no download was running (before the first or between two): nothing was lost */
  onPeerLeft?: () => void;
}

export interface SenderEvents extends TransferEvents {
  /** The receiver chose a destination and requested the first file of a download; the file list is fixed until it ends */
  onReceiverStarted?: (fileIndices: number[]) => void;
  /** A receiver used up its PIN attempts; the transfer then fails as usual */
  onPinLockout?: () => void;
}

export interface ReceiverEvents extends TransferEvents {
  onManifest?: (manifest: TransferManifest) => void;
  onPinRequired?: (prompt: PinPrompt) => void;
  /** The sender is busy with others; `position` 1 means this receiver is next */
  onQueued?: (position: number) => void;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface AppSettings {
  useCustomSignaling: boolean;
  signalingHost: string;
  signalingPort: number;
  signalingPath: string;
  signalingSecure: boolean;
  customStunTurn: IceServerConfig[];
  enableAudioAlerts: boolean;
}
