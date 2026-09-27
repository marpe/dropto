import { useEffect, useState } from 'react';

/** Read by the pre-paint script in index.html too: 'light' | 'dark', absent means follow the OS. */
export const THEME_STORAGE_KEY = 'theme';

export type ThemePreference = 'system' | 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch (err) {
    console.warn('Could not read the theme preference:', err);
  }
  return 'system';
}

function writePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch (err) {
    // The theme still applies for this visit
    console.warn('Could not save the theme preference:', err);
  }
}

/** Light/dark theme: an explicit choice, or the OS setting followed live. */
export function useTheme() {
  const [preference, setPreference] = useState(readPreference);
  const [isSystemDark, setIsSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  const isDark = preference === 'system' ? isSystemDark : preference === 'dark';

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const handleChange = (event: { matches: boolean }) => setIsSystemDark(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    writePreference(preference);
  }, [preference]);

  return { preference, setPreference, isDark };
}
