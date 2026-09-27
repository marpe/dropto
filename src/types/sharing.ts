import type { TransferMetrics } from './transfer';

/** Who may connect to a shared link, and how many at once. */
export interface SharingOptions {
  pin: string;
  /** Even receivers with the link key must be accepted by hand */
  requireApproval: boolean;
  /** The link stays open for several people; otherwise it serves one download and then stops working */
  allowMultiple: boolean;
  /** With `allowMultiple`: how many download at the same time; later arrivals wait in line */
  maxSimultaneous: number;
}

/** Where one receiver is, from arriving at the link to its download ending. */
export type ReceiverStage = 'queued' | 'choosing' | 'transferring' | 'completed' | 'failed';

export interface SenderReceiver {
  peerId: string;
  /** Arrival order within the current share, for naming people ("Person 2") */
  number: number;
  stage: ReceiverStage;
  /** The files it chose (indices into the sender's list); null until it starts downloading */
  fileIndices: number[] | null;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
  corruptedFiles: string[];
}

/** Someone who connected but has not been let in yet: waiting for the sender's OK, or for the link to be created. */
export interface PendingPeer {
  peerId: string;
  /** May be admitted without asking (valid link key, approval not required) once the link is shared */
  isTrusted: boolean;
}
