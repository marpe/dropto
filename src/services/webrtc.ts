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

/** One signalling session: a sender's room or a receiver's connection to a room. */
export class WebRtcService {
  private peer: Peer | null = null;
  private activeConn: DataConnection | null = null;
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

        const onOpen = () => {
          this.activeConn = conn;
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

  private handleIncomingConnection(conn: DataConnection) {
    // One receiver per room: a newcomer must not displace a pending or active peer
    if (this.activeConn) {
      conn.close();
      return;
    }
    this.activeConn = conn;
    this.awaitGreeting(conn);

    conn.on('close', () => {
      if (this.activeConn === conn) {
        this.activeConn = null;
      }
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
    const announce = (shareKey: string | null) => {
      if (isAnnounced) {
        return;
      }
      isAnnounced = true;
      clearTimeout(timeout);
      conn.off('data', onData);
      if (this.activeConn === conn) {
        this.handlers.onIncomingConnection?.(conn, { shareKey });
      }
    };
    const onData = (data: unknown) => {
      const message = typeof data === 'string' ? parseControlMessage(data) : null;
      if (message?.type === 'HELLO') {
        announce(message.payload.shareKey);
      }
    };
    const timeout = setTimeout(() => announce(null), GREETING_TIMEOUT_MS);
    conn.on('data', onData);
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
   * Gracefully closes the current peer connection (after queued messages are delivered)
   * but keeps the room open for the next receiver.
   */
  public disconnectPeer() {
    if (this.activeConn) {
      const conn = this.activeConn;
      this.activeConn = null;
      try {
        conn.close({ flush: true });
      } catch {
        // Already closed
      }
    }
  }

  public destroy() {
    this.activeConn = null;
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
