import type { DataConnection } from 'peerjs';

interface CandidatePairStats {
  localCandidateId?: string;
  remoteCandidateId?: string;
}

interface CandidateStats {
  address?: string;
  ip?: string;
  candidateType?: string;
}

export interface RemoteAddress {
  /** Null through a relay (that address is the relay's) or behind an mDNS `.local` name */
  ip: string | null;
  route: 'direct' | 'relayed';
}

/**
 * How this connection reaches the receiver, from the ICE candidate pair in use: its IP address and
 * whether the data goes through a relay (TURN) on either side. Null when that is not known (yet).
 */
export async function readRemoteAddress(conn: DataConnection): Promise<RemoteAddress | null> {
  const peerConnection = conn.peerConnection as RTCPeerConnection | undefined;
  if (!peerConnection) {
    return null;
  }
  try {
    const stats = await peerConnection.getStats();
    let pair: CandidatePairStats | undefined;
    stats.forEach((report) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        pair = stats.get(report.selectedCandidatePairId);
      }
    });
    if (!pair) {
      return null;
    }
    const remote: CandidateStats | undefined = pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : undefined;
    const local: CandidateStats | undefined = pair.localCandidateId ? stats.get(pair.localCandidateId) : undefined;
    const isRelayed = remote?.candidateType === 'relay' || local?.candidateType === 'relay';
    const address = remote?.address ?? remote?.ip;
    const isShown = !!address && remote?.candidateType !== 'relay' && !address.endsWith('.local');
    return { ip: isShown ? address : null, route: isRelayed ? 'relayed' : 'direct' };
  } catch {
    // Stats are unavailable once the connection has closed; the address is simply not shown
    return null;
  }
}
