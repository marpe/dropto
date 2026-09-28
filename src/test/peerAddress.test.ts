import { describe, it, expect } from 'vitest';
import type { DataConnection } from 'peerjs';
import { readRemoteAddress } from '../services/peerAddress';

/** A connection whose RTCPeerConnection reports the given stats entries. */
function connectionWithStats(entries: Record<string, unknown>[]): DataConnection {
  const report = new Map(entries.map((entry) => [entry.id as string, entry]));
  return { peerConnection: { getStats: async () => report } } as unknown as DataConnection;
}

const transport = { id: 't', type: 'transport', selectedCandidatePairId: 'pair' };
const pair = { id: 'pair', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote' };
const localHost = { id: 'local', type: 'local-candidate', address: '192.168.1.2', candidateType: 'host' };

describe('readRemoteAddress', () => {
  it('reads the address the connection actually uses, and that the route is direct', async () => {
    const conn = connectionWithStats([
      transport,
      pair,
      localHost,
      { id: 'remote', type: 'remote-candidate', address: '203.0.113.7', candidateType: 'srflx' },
    ]);

    expect(await readRemoteAddress(conn)).toEqual({ ip: '203.0.113.7', route: 'direct' });
  });

  it('hides the address of a relayed connection, which is the relay server, not the person', async () => {
    const conn = connectionWithStats([
      transport,
      pair,
      localHost,
      { id: 'remote', type: 'remote-candidate', address: '198.51.100.1', candidateType: 'relay' },
    ]);

    expect(await readRemoteAddress(conn)).toEqual({ ip: null, route: 'relayed' });
  });

  it('counts the route as relayed when this side goes through the relay, and still shows their address', async () => {
    const conn = connectionWithStats([
      transport,
      pair,
      { id: 'local', type: 'local-candidate', address: '198.51.100.1', candidateType: 'relay' },
      { id: 'remote', type: 'remote-candidate', address: '203.0.113.7', candidateType: 'srflx' },
    ]);

    expect(await readRemoteAddress(conn)).toEqual({ ip: '203.0.113.7', route: 'relayed' });
  });

  it('hides a local address hidden behind an mDNS name', async () => {
    const conn = connectionWithStats([
      transport,
      pair,
      localHost,
      { id: 'remote', type: 'remote-candidate', address: '1f0c-4c.local', candidateType: 'host' },
    ]);

    expect(await readRemoteAddress(conn)).toEqual({ ip: null, route: 'direct' });
  });

  it('shows nothing when the connection has no stats yet', async () => {
    expect(await readRemoteAddress({} as DataConnection)).toBeNull();
    expect(await readRemoteAddress(connectionWithStats([]))).toBeNull();
  });
});
