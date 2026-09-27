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

export interface TransferManifest {
  totalBytes: number;
  files: ManifestFile[];
}

export type SenderStatus = 'idle' | 'waiting' | 'awaiting_receiver' | 'transferring' | 'completed' | 'failed';

export type ReceiverStatus =
  | 'idle'
  | 'connecting'
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

/** JSON control messages; file data travels separately as binary chunks. */
export type ControlMessage =
  | { type: 'HELLO'; payload: { shareKey: string | null } }
  | { type: 'AUTH_REQUEST'; payload: PinPrompt }
  | { type: 'AUTH_RESPONSE'; payload: { pin: string } }
  | { type: 'MANIFEST'; payload: TransferManifest }
  | { type: 'FILE_START'; payload: { fileIndex: number } }
  | { type: 'FILE_COMPLETE'; payload: { fileIndex: number; checksum: string } }
  | { type: 'FILE_ACK'; payload: { fileIndex: number; isVerified: boolean } }
  | { type: 'TRANSFER_PAUSE' }
  | { type: 'TRANSFER_RESUME' }
  | { type: 'TRANSFER_CANCEL' }
  | { type: 'ERROR'; payload: { message: string } };

export type ControlMessageType = ControlMessage['type'];

export interface TransferMetrics {
  /** Bytes per second over the recent window */
  currentSpeed: number;
  averageSpeed: number;
  etaSeconds: number;
  bytesTransferred: number;
  totalBytes: number;
  overallPercent: number;
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  currentFilePercent: number;
}

/** Events a transfer reports to the UI; shared by the sender and receiver. */
export interface TransferEvents {
  onMetrics?: (metrics: TransferMetrics) => void;
  onFileComplete?: (fileIndex: number, isVerified: boolean) => void;
  onAllCompleted?: (result: TransferResult) => void;
  onError?: (message: string) => void;
  onPaused?: (isPaused: boolean) => void;
  onCancelled?: () => void;
}

export interface SenderEvents extends TransferEvents {
  /** The receiver chose a destination and requested the first file; the file list is now fixed */
  onReceiverStarted?: () => void;
}

export interface ReceiverEvents extends TransferEvents {
  onManifest?: (manifest: TransferManifest) => void;
  onPinRequired?: (prompt: PinPrompt) => void;
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
  enableWakeLock: boolean;
}
