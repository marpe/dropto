import type { FinishedFile, FormFactor, ManifestFile, StorageMode, TransferMetrics } from './transfer';

/** Who may connect to a shared link, and how many may download at once. Anyone may connect and choose. */
export interface SharingOptions {
  pin: string;
  /** Even receivers with the link key must be accepted by hand */
  requireApproval: boolean;
  /** How many download at the same time; others who start a download wait in line */
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
  /** Self-reported, like the rest below; absent when unknown */
  formFactor?: FormFactor;
  model?: string;
  /** Memory limits how much they can download at once */
  storage?: StorageMode;
  /** From the WebRTC connection, with the address: a relayed route (TURN) is usually much slower */
  route?: 'direct' | 'relayed';
}

export interface SenderReceiver {
  peerId: string;
  details: PeerDetails;
  stage: ReceiverStage;
  /** Since when they have been connected without downloading; null while downloading, in line or gone */
  idleSinceMs: number | null;
  /** Gone after finishing a download; still listed for what they got */
  hasLeft: boolean;
  /** The files of the download under way or last run, as they were when it started; empty before the first */
  downloadFiles: ManifestFile[];
  /** Every file it finished downloading on this connection, in the order first finished */
  sentFiles: ManifestFile[];
  /** How each of `sentFiles` went the last time, by id */
  finishedFiles: Record<string, FinishedFile>;
  /** Everything sent to them over finished (or failed) downloads, repeats included; the running one is in `metrics` */
  bytesSent: number;
  metrics: TransferMetrics | null;
  isPaused: boolean;
  error: string | null;
}

/** Someone who connected but has not been let in yet: waiting for the sender's OK, or for the link to be created. */
export interface PendingPeer {
  peerId: string;
  details: PeerDetails;
  /** May be admitted without asking (valid link key, approval not required) once the link is shared */
  isTrusted: boolean;
}
