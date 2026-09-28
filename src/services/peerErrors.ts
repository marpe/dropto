const SIGNALLING_UNREACHABLE = 'Couldn’t reach the connection server. Check your internet.';

const PEER_ERROR_MESSAGES: Record<string, string> = {
  'peer-unavailable': 'This link no longer works. Ask the sender for a new one.',
  network: 'Couldn’t connect. Check your internet.',
  'server-error': SIGNALLING_UNREACHABLE,
  'socket-error': SIGNALLING_UNREACHABLE,
  'socket-closed': SIGNALLING_UNREACHABLE,
  'browser-incompatible': 'This browser can’t transfer directly. Try Chrome, Edge or Firefox.',
  'connection-timeout':
    'Couldn’t reach the sender, likely a firewall. A TURN relay in Settings can help.',
  webrtc:
    'Couldn’t connect directly, likely a firewall. A TURN relay in Settings can help.',
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
  return 'Couldn’t connect. Try again.';
}
