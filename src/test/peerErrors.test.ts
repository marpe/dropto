import { describe, it, expect } from 'vitest';
import { describePeerError } from '../services/peerErrors';

describe('describePeerError', () => {
  it.each([
    ['peer-unavailable', /no longer exists|closed the page/i],
    ['network', /internet connection/i],
    ['server-error', /connection server/i],
    ['socket-error', /connection server/i],
    ['socket-closed', /connection server/i],
    ['browser-incompatible', /browser/i],
    ['webrtc', /direct connection|firewall/i],
  ])('explains a %s error in plain words', (type, expected) => {
    expect(describePeerError({ type, message: `Raw ${type} text` })).toMatch(expected);
  });

  it('falls back to the original message for unknown error types', () => {
    expect(describePeerError({ type: 'something-new', message: 'Raw detail' })).toBe('Raw detail');
  });

  it('handles values that are not PeerJS errors', () => {
    expect(describePeerError(new Error('Boom'))).toBe('Boom');
    expect(describePeerError('odd')).toMatch(/something went wrong/i);
  });

  it('explains a connection that timed out as a network route problem', () => {
    expect(describePeerError({ type: 'connection-timeout' })).toMatch(/firewall/i);
  });
});
