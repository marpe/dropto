import { describe, it, expect } from 'vitest';
import type { DataConnection } from 'peerjs';
import { readRemoteAddress } from '../services/peerAddress';

/** A connection whose RTCPeerConnection reports the given stats entries. */
function connectionWithStats(entries: Record<string, unknown>[]): DataConnection {
  const report = new Map(entries.map((entry) => [entry.id as string, entry]));
  return { peerConnection: { getStats: async () => report } } as unknown as DataConnection;
}

const transport = { id: 't', type: 'transport', selectedCandidatePairId: 'pair' };
const pair = { id: 'pair', type: 'candidate-pair', remoteCandidateId: 'remote' };

describe('readRemoteAddress', () => {
  it('reads the address the connection actually uses', async () => {
    const conn = connectionWithStats([
      transport,
      pair,
      { id: 'remote', type: 'remote-candidate', address: '203.0.113.7', candidateType: 'srflx' },
    ]);

    expect(await readRemoteAddress(conn)).toBe('203.0.113.7');
  });

  it('shows nothing for a relayed connection, whose address is the relay server, not the person', async () => {
    const conn = connectionWithStats([
      transport,
      pair,
      { id: 'remote', type: 'remote-candidate', address: '198.51.100.1', candidateType: 'relay' },
    ]);

    expect(await readRemoteAddress(conn)).toBeNull();
  });

  it('shows nothing for a hidden local address', async () => {
    const conn = connectionWithStats([
      transport,
      pair,
      { id: 'remote', type: 'remote-candidate', address: '1f0c-4c.local', candidateType: 'host' },
    ]);

    expect(await readRemoteAddress(conn)).toBeNull();
  });

  it('shows nothing when the connection has no stats yet', async () => {
    expect(await readRemoteAddress({} as DataConnection)).toBeNull();
    expect(await readRemoteAddress(connectionWithStats([]))).toBeNull();
  });
});
