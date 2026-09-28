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
    delete (navigator as any).wakeLock;
  });

  it('requests a screen wake lock', async () => {
    expect(await wakeLockService.acquire()).toBe(true);
    expect(request).toHaveBeenCalledWith('screen');
  });
});
