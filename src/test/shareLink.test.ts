import { describe, it, expect } from 'vitest';
import { buildShareUrl, generateShareKey, parseShareLink, parseShareUrl, stripShareKeyFromUrl } from '../utils/shareLink';

describe('generateShareKey', () => {
  it('produces a URL-safe 128-bit key', () => {
    const key = generateShareKey();

    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 50 }, generateShareKey));

    expect(keys.size).toBe(50);
  });
});

describe('share links', () => {
  it('puts the room in the query and the key in the fragment, which browsers never send to servers', () => {
    const url = new URL(buildShareUrl('https://dropto.space/', 'DT-ABC234', 'k3y_Value-1'));

    expect(url.searchParams.get('room')).toBe('DT-ABC234');
    expect(url.hash).toBe('#key=k3y_Value-1');
  });

  it('reads the room code and key back from a share link', () => {
    const link = new URL(buildShareUrl('https://dropto.space/', 'DT-ABC234', 'k3y_Value-1'));

    expect(parseShareLink(link.search, link.hash)).toEqual({ roomCode: 'DT-ABC234', shareKey: 'k3y_Value-1' });
  });

  it('normalises a lower-case room code and tolerates a missing key', () => {
    expect(parseShareLink('?room=dw-abc234', '')).toEqual({ roomCode: 'DW-ABC234', shareKey: null });
  });

  it('returns nothing useful for a plain visit', () => {
    expect(parseShareLink('', '')).toEqual({ roomCode: '', shareKey: null });
  });

  it('removes only the key from the address, keeping the room for reloads', () => {
    expect(stripShareKeyFromUrl('https://dropto.space/?room=DT-ABC234#key=secret')).toBe(
      'https://dropto.space/?room=DT-ABC234'
    );
  });

  it('recognises a whole share link pasted as text', () => {
    expect(parseShareUrl('  https://dropto.space/?room=dt-abc234#key=Secret_1 ')).toEqual({
      roomCode: 'DT-ABC234',
      shareKey: 'Secret_1',
    });
  });

  it('does not mistake a room code or an unrelated URL for a share link', () => {
    expect(parseShareUrl('DT-ABC234')).toBeNull();
    expect(parseShareUrl('https://example.com/page')).toBeNull();
  });
});
