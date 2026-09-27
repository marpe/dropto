import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme, THEME_STORAGE_KEY } from '../hooks/useTheme';

type ChangeListener = (event: { matches: boolean }) => void;

/** A controllable `prefers-color-scheme: dark` media query. */
function mockSystemTheme(isDark: boolean) {
  const listeners = new Set<ChangeListener>();
  const query = {
    matches: isDark,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    change(nextIsDark: boolean) {
      query.matches = nextIsDark;
      listeners.forEach((listener) => listener({ matches: nextIsDark }));
    },
  };
}

const isDarkApplied = () => document.documentElement.classList.contains('dark');

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the operating system by default, including later changes', () => {
    const system = mockSystemTheme(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('system');
    expect(isDarkApplied()).toBe(false);

    act(() => {
      system.change(true);
    });

    expect(result.current.isDark).toBe(true);
    expect(isDarkApplied()).toBe(true);
  });

  it('keeps an explicit choice regardless of the operating system, and remembers it', () => {
    const system = mockSystemTheme(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPreference('dark');
    });
    act(() => {
      system.change(false);
    });

    expect(isDarkApplied()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('forgets the stored choice when switching back to the system theme', () => {
    mockSystemTheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe('light');

    act(() => {
      result.current.setPreference('system');
    });

    // The pre-paint script in index.html follows the OS when nothing is stored
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(isDarkApplied()).toBe(true);
  });
});
