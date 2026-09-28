import type { PeerDetails } from '../types/sharing';
import type { FormFactor, StorageMode } from '../types/transfer';
import { supportsSaveFilePicker } from './fileSystemAccess';

/** What a receiver tells the sender about itself, so people can be told apart in the sender's list. */
export interface DeviceIntroduction {
  /** e.g. "Chrome on Android" */
  device: string | null;
  /** IANA time zone, e.g. "Europe/Stockholm": a rough, self-reported location that needs no lookup */
  timeZone: string | null;
  /** This tab, across reloads: a reconnect picks up where the previous connection left off */
  sessionId: string | null;
  formFactor: FormFactor | null;
  /** e.g. "Pixel 8"; only Chromium on Android tells */
  model: string | null;
  /** Whether downloads stream to disk or are held in memory, which limits their size */
  storage: StorageMode;
}

// Order matters: Edge, Opera and Samsung Internet also claim to be Chrome, and Chrome claims to be Safari
const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

function firstMatch(userAgent: string, table: [RegExp, string][]): string | null {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/** "Chrome on Android" from a user-agent string; null when it says nothing recognisable. */
export function describeDevice(userAgent: string): string | null {
  const browser = firstMatch(userAgent, BROWSERS);
  const system = firstMatch(userAgent, SYSTEMS);
  if (browser && system) {
    return `${browser} on ${system}`;
  }
  if (system) {
    return `${system} device`;
  }
  return browser;
}

/** The city part of a time zone ("America/New_York" → "New York"); null for zones like UTC. */
export function placeFromTimeZone(timeZone: string | null): string | null {
  if (!timeZone || !timeZone.includes('/') || timeZone.startsWith('Etc/')) {
    return null;
  }
  return timeZone.split('/').at(-1)?.replaceAll('_', ' ') ?? null;
}

/**
 * Phone, tablet or computer from a user-agent string. iPads ask for desktop sites and claim to be Macs,
 * so a touch screen gives them away; Android tablets leave "Mobile" out.
 */
export function describeFormFactor(userAgent: string, maxTouchPoints = 0): FormFactor {
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) {
    return 'tablet';
  }
  if (/Android/.test(userAgent)) {
    return /Mobile/.test(userAgent) ? 'phone' : 'tablet';
  }
  return /iPhone|iPod|Mobi/.test(userAgent) ? 'phone' : 'desktop';
}

interface UserAgentData {
  getHighEntropyValues(hints: string[]): Promise<{ model?: string }>;
}

// Long enough for the browser to answer, short enough never to hold up connecting
const MODEL_LOOKUP_TIMEOUT_MS = 500;

/** The device model from User-Agent Client Hints; only Chromium has them, and only Android fills in a model. */
async function lookUpModel(): Promise<string | null> {
  const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  if (!userAgentData) {
    return null;
  }
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), MODEL_LOOKUP_TIMEOUT_MS));
  try {
    const values = await Promise.race([userAgentData.getHighEntropyValues(['model']), timeout]);
    return values?.model?.trim() || null;
  } catch {
    // The browser declined to tell: the model is simply not shown
    return null;
  }
}

/** This browser's introduction, sent with the receiver's first message. */
export async function introduceThisDevice(): Promise<DeviceIntroduction> {
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // No Intl time zone support: the sender just shows no place
  }
  const hasNavigator = typeof navigator !== 'undefined';
  return {
    device: hasNavigator ? describeDevice(navigator.userAgent) : null,
    timeZone,
    sessionId: recallTabSession(),
    formFactor: hasNavigator ? describeFormFactor(navigator.userAgent, navigator.maxTouchPoints) : null,
    model: hasNavigator ? await lookUpModel() : null,
    storage: supportsSaveFilePicker() ? 'disk' : 'memory',
  };
}

const TAB_SESSION_STORAGE_KEY = 'receiver-session';

/** A random id for this tab, created on first use; sessionStorage keeps it across reloads but not across tabs. */
function recallTabSession(): string | null {
  try {
    const known = sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
    if (known) {
      return known;
    }
    const created = crypto.randomUUID();
    sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage blocked: every connection counts as someone new
    return null;
  }
}

const KNOWN_BROWSERS = new Set(BROWSERS.map(([, name]) => name));

export interface PeerDescription {
  /** Shown as its logo; null when the device did not say */
  browser: string | null;
  /** The system ("Android"), or the whole device description when no browser is named */
  name: string;
  meta: string | null;
}

/** How a receiver is labelled on the sender's side: browser and system (and model), then whatever else is known. */
export function describePeer(details: PeerDetails): PeerDescription {
  const place = placeFromTimeZone(details.timeZone);
  const meta =
    [details.ip, place && `Time zone: ${place}`, details.route === 'relayed' && 'Relayed'].filter(Boolean).join(' · ') ||
    null;
  const withModel = (name: string) => (details.model ? `${name} · ${details.model}` : name);
  // "Chrome on Android", as built by describeDevice
  const [browser, system] = details.device?.split(' on ') ?? [];
  if (browser && system && KNOWN_BROWSERS.has(browser)) {
    return { browser, name: withModel(system), meta };
  }
  return { browser: null, name: withModel(details.device ?? 'Unknown device'), meta };
}
