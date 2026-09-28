import { soundService } from './sound';
import { wakeLockService } from './wakeLock';
import { notificationService } from './notifications';

/** Device-level side effects around a transfer, kept out of the protocol code. */
export interface TransferEffects {
  /** Someone arrived on the link, or this receiver reached the sender */
  onPeerConnected(): void;
  /** Runs inside the click that shares or starts a download, while the browser still allows permission prompts */
  onTransferRequested(): void;
  onTransferStarted(): void;
  onTransferEnded(isSuccessful: boolean): void;
}

export const defaultTransferEffects: TransferEffects = {
  onPeerConnected: () => {
    soundService.playConnect();
  },
  onTransferRequested: () => {
    void notificationService.requestPermission();
  },
  onTransferStarted: () => {
    wakeLockService.acquire();
    soundService.playStart();
  },
  onTransferEnded: (isSuccessful) => {
    wakeLockService.release();
    if (isSuccessful) {
      soundService.playComplete();
    }
    notificationService.notifyTransferEnded(isSuccessful);
  },
};
