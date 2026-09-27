export interface TransferFile {
  id: string;
  name: string;
  size: number;
  type: string;
  relativePath?: string;
  lastModified?: number;
  rawFile?: File; // Present on sender
  chunkSize: number;
  totalChunks: number;
  status: 'pending' | 'transferring' | 'completed' | 'paused' | 'failed';
  bytesTransferred: number;
  checksum?: string;
}

export interface TransferManifest {
  sessionId: string;
  pinRequired: boolean;
  totalBytes: number;
  files: ManifestFile[];
}

export type ManifestFile = Omit<TransferFile, 'rawFile' | 'status' | 'bytesTransferred'>;

export type SenderStatus = 'idle' | 'waiting' | 'transferring' | 'completed' | 'failed';

export type ReceiverStatus =
  | 'idle'
  | 'connecting'
  | 'waiting_approval'
  | 'connected'
  | 'transferring'
  | 'completed'
  | 'error';

export type ProtocolMessageType =
  | 'HELLO'
  | 'AUTH_REQUEST'
  | 'AUTH_RESPONSE'
  | 'MANIFEST'
  | 'FILE_START'
  | 'FILE_ACK'
  | 'FILE_COMPLETE'
  | 'TRANSFER_PAUSE'
  | 'TRANSFER_RESUME'
  | 'TRANSFER_CANCEL'
  | 'ERROR';

export interface ProtocolMessage {
  type: ProtocolMessageType;
  sessionId?: string;
  payload?: any;
}

export interface TransferMetrics {
  currentSpeed: number; // bytes per second
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
