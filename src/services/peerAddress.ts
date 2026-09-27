import type { DataConnection } from 'peerjs';

interface CandidatePairStats {
  remoteCandidateId?: string;
}

interface CandidateStats {
  address?: string;
  ip?: string;
  candidateType?: string;
}

/**
 * The receiver's IP address as this connection sees it, from the ICE candidate pair in use.
 * Null when unknown, when the route goes through a relay (that address is the relay's) or when
 * the browser hides the address behind an mDNS `.local` name.
 */
export async function readRemoteAddress(conn: DataConnection): Promise<string | null> {
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
    const remote: CandidateStats | undefined = pair?.remoteCandidateId ? stats.get(pair.remoteCandidateId) : undefined;
    const address = remote?.address ?? remote?.ip;
    if (!address || remote?.candidateType === 'relay' || address.endsWith('.local')) {
      return null;
    }
    return address;
  } catch {
    // Stats are unavailable once the connection has closed; the address is simply not shown
    return null;
  }
}
