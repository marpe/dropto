// @env browser
import { getActiveBrand } from '../branding';

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** System notifications when a transfer ends while the user is looking at another tab or app. */
export class NotificationService {
  /** Must run from a user gesture; browsers ignore permission prompts otherwise. Asks at most once. */
  public async requestPermission(): Promise<boolean> {
    if (!isSupported()) {
      return false;
    }
    if (Notification.permission !== 'default') {
      return Notification.permission === 'granted';
    }
    try {
      return (await Notification.requestPermission()) === 'granted';
    } catch (err) {
      console.warn('Notification permission request failed:', err);
      return false;
    }
  }

  public notifyTransferEnded(isSuccessful: boolean) {
    // Someone watching the page already sees the result
    if (!isSupported() || Notification.permission !== 'granted' || !document.hidden) {
      return;
    }
    try {
      new Notification(getActiveBrand().name, {
        body: isSuccessful ? 'Transfer complete' : 'Transfer stopped',
        icon: getActiveBrand().favicon,
      });
    } catch (err) {
      // Some mobile browsers only allow notifications from a service worker
      console.warn('Could not show a notification:', err);
    }
  }
}

export const notificationService = new NotificationService();
