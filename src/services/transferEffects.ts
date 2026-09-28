import { soundService } from './sound';
import { wakeLockService } from './wakeLock';
import { notificationService } from './notifications';

/** Device-level side effects around a transfer, kept out of the protocol code. */
export interface TransferEffects {
  /** Runs inside the click that shares or starts a download, while the browser still allows permission prompts */
  onTransferRequested(): void;
  onTransferStarted(): void;
  onTransferEnded(isSuccessful: boolean): void;
}

export const defaultTransferEffects: TransferEffects = {
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
