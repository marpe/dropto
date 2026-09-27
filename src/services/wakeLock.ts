class WakeLockService {
  private wakeLock: any = null;
  private isRequested: boolean = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (this.isRequested && document.visibilityState === 'visible') {
          this.acquire();
        }
      });
    }
  }

  public async acquire(): Promise<boolean> {
    this.isRequested = true;
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
        return false;
      }
    }
    return false;
  }

  public release() {
    this.isRequested = false;
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }
}

export const wakeLockService = new WakeLockService();
