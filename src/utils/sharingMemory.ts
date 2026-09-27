export const MAX_SIMULTANEOUS_STORAGE_KEY = 'max-simultaneous-downloads';
export const MIN_SIMULTANEOUS = 1;
export const MAX_SIMULTANEOUS = 10;
const DEFAULT_SIMULTANEOUS = 3;

export function clampSimultaneous(value: number): number {
  return Math.min(Math.max(Math.round(value), MIN_SIMULTANEOUS), MAX_SIMULTANEOUS);
}

/** The download limit the sender chose last time, so a regular setup does not have to be redone. */
export function recallMaxSimultaneous(): number {
  try {
    const stored = Number(localStorage.getItem(MAX_SIMULTANEOUS_STORAGE_KEY));
    return stored ? clampSimultaneous(stored) : DEFAULT_SIMULTANEOUS;
  } catch {
    // Storage blocked (e.g. privacy mode): the default is a fine answer
    return DEFAULT_SIMULTANEOUS;
  }
}

export function rememberMaxSimultaneous(value: number) {
  try {
    localStorage.setItem(MAX_SIMULTANEOUS_STORAGE_KEY, String(clampSimultaneous(value)));
  } catch {
    // Storage blocked: the choice simply is not remembered
  }
}
