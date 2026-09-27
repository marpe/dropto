import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLeaveGuard } from '../hooks/useLeaveGuard';

function attemptToLeave(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('useLeaveGuard', () => {
  it('asks the browser to confirm leaving while a transfer is running', () => {
    renderHook(() => useLeaveGuard(true));

    expect(attemptToLeave()).toBe(true);
  });

  it('lets the page close freely when nothing is running', () => {
    renderHook(() => useLeaveGuard(false));

    expect(attemptToLeave()).toBe(false);
  });

  it('stops guarding once the transfer ends', () => {
    const { rerender } = renderHook(({ isActive }) => useLeaveGuard(isActive), { initialProps: { isActive: true } });

    rerender({ isActive: false });

    expect(attemptToLeave()).toBe(false);
  });
});
