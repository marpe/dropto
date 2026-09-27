import type { PeerDetails } from '../types/sharing';

/** What a receiver tells the sender about itself, so people can be told apart in the sender's list. */
export interface DeviceIntroduction {
  /** e.g. "Chrome on Android" */
  device: string | null;
  /** IANA time zone, e.g. "Europe/Stockholm": a rough, self-reported location that needs no lookup */
  timeZone: string | null;
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

/** This browser's introduction, sent with the receiver's first message. */
export function introduceThisDevice(): DeviceIntroduction {
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // No Intl time zone support: the sender just shows no place
  }
  return {
    device: typeof navigator === 'undefined' ? null : describeDevice(navigator.userAgent),
    timeZone,
  };
}

/** How a receiver is labelled on the sender's side: the device, then whatever else is known. */
export function describePeer(details: PeerDetails): { name: string; meta: string | null } {
  const meta = [details.ip, placeFromTimeZone(details.timeZone)].filter(Boolean).join(' · ');
  return { name: details.device ?? 'Unknown device', meta: meta || null };
}
