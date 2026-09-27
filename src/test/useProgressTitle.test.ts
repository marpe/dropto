import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProgressTitle } from '../hooks/useProgressTitle';

describe('useProgressTitle', () => {
  beforeEach(() => {
    document.title = 'DropWave';
  });

  afterEach(() => {
    delete document.documentElement.dataset.brand;
  });

  it('shows rounded progress and the brand name in the tab while transferring', () => {
    document.documentElement.dataset.brand = 'dropto';

    renderHook(() => useProgressTitle(41.6));

    expect(document.title).toBe('(42%) dropto.space — Transferring');
  });

  it('restores the original title once the transfer ends', () => {
    const { rerender } = renderHook(({ percent }) => useProgressTitle(percent), {
      initialProps: { percent: 10 as number | null },
    });
    rerender({ percent: 80 });

    rerender({ percent: null });

    expect(document.title).toBe('DropWave');
  });

  it('restores the original title when unmounted mid-transfer', () => {
    const { unmount } = renderHook(() => useProgressTitle(50));

    unmount();

    expect(document.title).toBe('DropWave');
  });

  it('leaves the title alone when nothing is transferring', () => {
    renderHook(() => useProgressTitle(null));

    expect(document.title).toBe('DropWave');
  });
});
