import { useEffect, useState } from 'react';
import { soundService } from '../services/sound';
import type { AppSettings } from '../types/transfer';

const STORAGE_KEY = 'dropwave_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  useCustomSignaling: false,
  signalingHost: '',
  signalingPort: 9000,
  signalingPath: '/',
  signalingSecure: true,
  customStunTurn: [],
  enableAudioAlerts: true,
};

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Unreadable stored settings: fall back to defaults
  }
  return DEFAULT_SETTINGS;
}

/** Persisted user settings; the sound choice is also pushed into the sound service. */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    soundService.enabled = settings.enableAudioAlerts;
  }, [settings]);

  const saveSettings = (next: AppSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (e.g. private mode): settings still apply for this session
    }
  };

  return [settings, saveSettings] as const;
}
