import { soundService } from './sound';
import { wakeLockService } from './wakeLock';

/** Device-level side effects around a transfer, kept out of the protocol code. */
export interface TransferEffects {
  onTransferStarted(): void;
  onTransferEnded(isSuccessful: boolean): void;
}

export const defaultTransferEffects: TransferEffects = {
  onTransferStarted: () => {
    wakeLockService.acquire();
    soundService.playStart();
  },
  onTransferEnded: (isSuccessful) => {
    wakeLockService.release();
    if (isSuccessful) {
      soundService.playComplete();
    }
  },
};
