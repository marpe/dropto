import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wakeLockService } from '../services/wakeLock';

describe('wakeLockService', () => {
  let request: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    request = vi.fn().mockResolvedValue({ addEventListener: vi.fn(), release: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  });

  afterEach(() => {
    wakeLockService.release();
    wakeLockService.enabled = true;
    delete (navigator as any).wakeLock;
  });

  it('requests a screen wake lock when enabled', async () => {
    wakeLockService.enabled = true;

    expect(await wakeLockService.acquire()).toBe(true);
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('does not request a wake lock when the user disabled it in settings', async () => {
    wakeLockService.enabled = false;

    expect(await wakeLockService.acquire()).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
