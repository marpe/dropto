import Peer from 'peerjs';
import type { DataConnection, PeerOptions } from 'peerjs';
import type { AppSettings } from '../types/transfer';
import { getActiveBrand } from '../branding';
import { parseControlMessage } from './transfer/protocol';

export interface ReceiverGreeting {
  /** Key from the sender's share link, or null when the room code was typed in */
  shareKey: string | null;
}

export interface SenderRoomOptions {
  preferredRoomId?: string;
}

export type ConnectionEventHandler = {
  onIncomingConnection?: (conn: DataConnection, greeting: ReceiverGreeting) => void;
  /** peerId identifies which incoming connection closed; absent when the whole session ended */
  onDisconnected?: (peerId?: string) => void;
  onError?: (err: unknown) => void;
};

const MAX_ROOM_ID_ATTEMPTS = 4;
const GREETING_TIMEOUT_MS = 3_000;
// ICE usually settles within a few seconds; past this, no direct route exists (e.g. both sides behind strict NATs)
const CONNECT_TIMEOUT_MS = 20_000;

/** One signalling session: a sender's room or a receiver's connection to a room. */
export class WebRtcService {
  private peer: Peer | null = null;
  // A sender's room may hold several receivers; a receiver holds its one connection to the sender
  private readonly connections = new Set<DataConnection>();
  private readonly handlers: ConnectionEventHandler;

  // Standard Google public STUN servers for reliable direct NAT traversal
  private defaultIceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  constructor(handlers: ConnectionEventHandler = {}) {
    this.handlers = handlers;
  }

  public generateRoomId(): string {
    // 32 symbols divide 256 evenly, so `byte % 32` is unbiased
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
    return `${getActiveBrand().roomPrefix}-${code}`;
  }

  /** Opens a room, reusing `preferredRoomId` when it is still free (e.g. after a sender reload). */
  public initSender(settings?: Partial<AppSettings>, { preferredRoomId }: SenderRoomOptions = {}): Promise<string> {
    return this.openRoom(settings, preferredRoomId ?? this.generateRoomId(), 1);
  }

  private openRoom(settings: Partial<AppSettings> | undefined, roomId: string, attempt: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.destroy();

      const peer = new Peer(roomId, this.buildPeerOptions(settings));
      this.peer = peer;

      peer.on('open', (id) => {
        resolve(id);
      });

      peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'unavailable-id' && attempt < MAX_ROOM_ID_ATTEMPTS) {
          // Room code already taken on the signalling server; try a fresh one
          this.openRoom(settings, this.generateRoomId(), attempt + 1).then(resolve, reject);
        } else {
          this.handlers.onError?.(err);
          reject(err);
        }
      });

      peer.on('close', () => {
        this.handlers.onDisconnected?.();
      });
    });
  }

  public initReceiver(targetRoomId: string, settings?: Partial<AppSettings>): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      this.destroy();

      // Receiver gets an ephemeral random ID
      const peer = new Peer(this.buildPeerOptions(settings));
      this.peer = peer;

      peer.on('open', () => {
        const conn = peer.connect(targetRoomId, {
          reliable: true,
        });

        // PeerJS never reports a data channel that simply fails to open; without this the UI spins forever
        const timeout = setTimeout(() => {
          const err = Object.assign(new Error('Timed out connecting to the sender'), { type: 'connection-timeout' });
          this.handlers.onError?.(err);
          reject(err);
        }, CONNECT_TIMEOUT_MS);
        const onOpen = () => {
          clearTimeout(timeout);
          this.connections.add(conn);
          resolve(conn);
        };
        if (conn.open) {
          onOpen();
        } else {
          conn.on('open', onOpen);
        }

        conn.on('close', () => {
          this.handlers.onDisconnected?.();
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Connection error:', err);
          this.handlers.onError?.(err);
          reject(err);
        });
      });

      peer.on('error', (err) => {
        console.error('Receiver Peer error:', err);
        this.handlers.onError?.(err);
        reject(err);
      });
    });
  }

  /** Every receiver is announced; how many may stay (and who waits in line) is the session's decision. */
  private handleIncomingConnection(conn: DataConnection) {
    this.connections.add(conn);
    this.awaitGreeting(conn);

    conn.on('close', () => {
      this.connections.delete(conn);
      this.handlers.onDisconnected?.(conn.peer);
    });

    conn.on('error', (err) => {
      console.error('DataConnection error:', err);
      this.handlers.onError?.(err);
    });
  }

  /**
   * Announces the connection once the receiver's HELLO (carrying any share-link key) arrives.
   * Listening starts immediately so a HELLO sent right after the channel opens is never missed;
   * receivers that never greet (older clients) are announced without a key after a timeout.
   */
  private awaitGreeting(conn: DataConnection) {
    let isAnnounced = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const announce = (shareKey: string | null) => {
      if (isAnnounced) {
        return;
      }
      isAnnounced = true;
      clearTimeout(timeout);
      conn.off('data', onData);
      conn.off('open', startFallback);
      if (this.connections.has(conn)) {
        this.handlers.onIncomingConnection?.(conn, { shareKey });
      }
    };
    const onData = (data: unknown) => {
      const message = typeof data === 'string' ? parseControlMessage(data) : null;
      if (message?.type === 'HELLO') {
        announce(message.payload.shareKey);
      }
    };
    // The fallback clock only starts once the channel is open: a connection that never opens is never offered
    const startFallback = () => {
      timeout = setTimeout(() => announce(null), GREETING_TIMEOUT_MS);
    };
    conn.on('data', onData);
    if (conn.open) {
      startFallback();
    } else {
      conn.on('open', startFallback);
    }
  }

  private buildPeerOptions(settings?: Partial<AppSettings>): PeerOptions {
    const iceServers = settings?.customStunTurn?.length
      ? [...this.defaultIceServers, ...settings.customStunTurn]
      : this.defaultIceServers;

    const baseOptions: PeerOptions = {
      debug: 1,
      config: {
        iceServers,
        iceCandidatePoolSize: 10,
      },
    };

    if (settings?.useCustomSignaling && settings.signalingHost) {
      baseOptions.host = settings.signalingHost;
      baseOptions.port = settings.signalingPort || 9000;
      baseOptions.path = settings.signalingPath || '/';
      baseOptions.secure = !!settings.signalingSecure;
    }

    return baseOptions;
  }

  /**
   * Gracefully closes one receiver's connection (or, without `peerId`, every connection) once queued
   * messages are delivered, but keeps the room open for others.
   */
  public disconnectPeer(peerId?: string) {
    for (const conn of [...this.connections]) {
      if (peerId !== undefined && conn.peer !== peerId) {
        continue;
      }
      this.connections.delete(conn);
      try {
        conn.close({ flush: true });
      } catch {
        // Already closed
      }
    }
  }

  public destroy() {
    this.connections.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Already destroyed
      }
      this.peer = null;
    }
  }
}
