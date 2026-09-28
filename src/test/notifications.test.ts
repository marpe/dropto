import { describe, it, expect, vi, afterEach } from 'vitest';
import { NotificationService } from '../services/notifications';

function stubNotifications(permission: NotificationPermission) {
  const shown: { title: string; body?: string }[] = [];
  class FakeNotification {
    public static permission = permission;
    public static requestPermission = vi.fn(async () => FakeNotification.permission);
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, body: options?.body });
    }
  }
  vi.stubGlobal('Notification', FakeNotification);
  return { shown, FakeNotification };
}

function setTabHidden(isHidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: isHidden });
}

describe('NotificationService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setTabHidden(false);
  });

  it('tells a user in another tab that the transfer finished', () => {
    const { shown } = stubNotifications('granted');
    setTabHidden(true);
    const service = new NotificationService();

    service.notifyTransferEnded(true);

    expect(shown).toHaveLength(1);
    expect(shown[0].body).toMatch(/complete/i);
  });

  it('stays quiet while the tab is visible or without permission', () => {
    const granted = stubNotifications('granted');
    const service = new NotificationService();
    service.notifyTransferEnded(true);
    expect(granted.shown).toHaveLength(0);

    setTabHidden(true);
    const denied = stubNotifications('denied');
    service.notifyTransferEnded(true);
    expect(denied.shown).toHaveLength(0);
  });

  it('asks for permission only while the browser has not been asked yet', async () => {
    const { FakeNotification } = stubNotifications('denied');

    expect(await new NotificationService().requestPermission()).toBe(false);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('asks for permission and reports whether it was granted', async () => {
    const { FakeNotification } = stubNotifications('default');
    FakeNotification.requestPermission.mockImplementation(async () => 'granted');

    expect(await new NotificationService().requestPermission()).toBe(true);
  });
});
