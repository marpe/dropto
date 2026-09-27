import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('useCopyToClipboard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows copied after a successful write, then resets', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const { result } = renderHook(() => useCopyToClipboard(2000));

    await act(async () => {
      await result.current[1]('DW-ABC234');
    });

    expect(writeText).toHaveBeenCalledWith('DW-ABC234');
    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current[0]).toBe(false);
  });

  it('does not claim success when the clipboard write is refused', async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error('Permission denied')));
    const { result } = renderHook(() => useCopyToClipboard());

    let ok = true;
    await act(async () => {
      ok = await result.current[1]('DW-ABC234');
    });

    expect(ok).toBe(false);
    expect(result.current[0]).toBe(false);
  });
});
