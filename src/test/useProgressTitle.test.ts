import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProgressTitle } from '../hooks/useProgressTitle';

describe('useProgressTitle', () => {
  beforeEach(() => {
    document.title = 'dropto.space';
  });

  it('shows rounded progress and the app name in the tab while transferring', () => {
    renderHook(() => useProgressTitle(41.6));

    expect(document.title).toBe('(42%) dropto.space — Transferring');
  });

  it('restores the original title once the transfer ends', () => {
    const { rerender } = renderHook(({ percent }) => useProgressTitle(percent), {
      initialProps: { percent: 10 as number | null },
    });
    rerender({ percent: 80 });

    rerender({ percent: null });

    expect(document.title).toBe('dropto.space');
  });

  it('restores the original title when unmounted mid-transfer', () => {
    const { unmount } = renderHook(() => useProgressTitle(50));

    unmount();

    expect(document.title).toBe('dropto.space');
  });

  it('leaves the title alone when nothing is transferring', () => {
    renderHook(() => useProgressTitle(null));

    expect(document.title).toBe('dropto.space');
  });
});
