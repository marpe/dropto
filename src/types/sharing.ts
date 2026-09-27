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

/** What the sender knows about a receiver, to tell people apart. Any part may be unknown. */
export interface PeerDetails {
  /** Self-reported, e.g. "Chrome on Android" */
  device: string | null;
  /** Self-reported IANA time zone, shown as a rough place */
  timeZone: string | null;
  /** From the WebRTC connection; arrives shortly after the receiver does */
  ip: string | null;
}

export interface SenderReceiver {
  peerId: string;
  details: PeerDetails;
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
  details: PeerDetails;
  /** May be admitted without asking (valid link key, approval not required) once the link is shared */
  isTrusted: boolean;
}
