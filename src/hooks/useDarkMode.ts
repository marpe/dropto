import { useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

function prefersDark(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored === 'dark';
    }
  } catch {
    // Storage unavailable: follow the OS preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Dark/light theme persisted across visits; index.html applies it before first paint to avoid a flash. */
export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(prefersDark);

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', darkMode);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage unavailable: theme still applies for this session
    }
  }, [darkMode]);

  return [darkMode, () => setDarkMode((current) => !current)] as const;
}
