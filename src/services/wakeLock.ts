class WakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private isRequested: boolean = false;
  public enabled: boolean = true;

  constructor() {
    if (typeof document !== 'undefined') {
      // Browsers drop wake locks when the tab is hidden; re-acquire once it is visible again
      document.addEventListener('visibilitychange', () => {
        if (this.isRequested && document.visibilityState === 'visible') {
          this.acquire();
        }
      });
    }
  }

  public async acquire(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    this.isRequested = true;
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
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
}

export const wakeLockService = new WakeLockService();
