const SHARE_KEY_BYTES = 16;

export interface ShareLink {
  roomCode: string;
  /** Present only on links copied from the sender; it lets the receiver in without manual approval */
  shareKey: string | null;
}

/** A random 128-bit, URL-safe key identifying people the sender shared the link with. */
export function generateShareKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SHARE_KEY_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The key goes in the fragment: browsers never send fragments to servers or in Referer headers. */
export function buildShareUrl(pageUrl: string, roomCode: string, shareKey: string): string {
  const url = new URL(pageUrl);
  url.search = new URLSearchParams({ room: roomCode }).toString();
  url.hash = new URLSearchParams({ key: shareKey }).toString();
  return url.toString();
}

export function parseShareLink(search: string, hash: string): ShareLink {
  const roomCode = new URLSearchParams(search).get('room')?.trim().toUpperCase() ?? '';
  const shareKey = new URLSearchParams(hash.replace(/^#/, '')).get('key') || null;
  return { roomCode, shareKey };
}

/** Keeps `?room=` so a reload still pre-fills the code, but drops the key from the visible address. */
export function stripShareKeyFromUrl(href: string): string {
  const url = new URL(href);
  url.hash = '';
  return url.toString();
}
