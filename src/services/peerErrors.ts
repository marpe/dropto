const SIGNALLING_UNREACHABLE = 'Couldn’t reach the connection server. Check your internet connection and try again.';

const PEER_ERROR_MESSAGES: Record<string, string> = {
  'peer-unavailable': 'This room no longer exists — the sender may have closed the page. Ask them for a new link.',
  network: 'Couldn’t connect. Check your internet connection and try again.',
  'server-error': SIGNALLING_UNREACHABLE,
  'socket-error': SIGNALLING_UNREACHABLE,
  'socket-closed': SIGNALLING_UNREACHABLE,
  'browser-incompatible': 'This browser doesn’t support direct peer-to-peer transfers. Try a recent Chrome, Edge or Firefox.',
  'connection-timeout':
    'Couldn’t reach the sender directly, often because of a strict firewall on either side. Adding a TURN relay in Settings can help.',
  webrtc:
    'A direct connection couldn’t be established, often because of a strict firewall. Adding a TURN relay in Settings can help.',
};

/** Turns a PeerJS error (or anything thrown) into a message a person can act on. */
export function describePeerError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const { type, message } = err as { type?: unknown; message?: unknown };
    if (typeof type === 'string' && type in PEER_ERROR_MESSAGES) {
      return PEER_ERROR_MESSAGES[type];
    }
    if (typeof message === 'string' && message) {
      return message;
    }
  }
  return 'Something went wrong while connecting. Please try again.';
}
