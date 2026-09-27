import Peer from 'peerjs';
import type { DataConnection, PeerOptions } from 'peerjs';
import type { AppSettings } from '../types/transfer';

export type ConnectionEventHandler = {
  onIncomingConnection?: (conn: DataConnection) => void;
  /** peerId identifies which incoming connection closed; absent when the whole session ended */
  onDisconnected?: (peerId?: string) => void;
  onError?: (err: any) => void;
};

const MAX_ROOM_ID_ATTEMPTS = 4;

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
    return `DW-${code}`;
  }

  public initSender(settings?: Partial<AppSettings>, attempt = 1): Promise<string> {
    return new Promise((resolve, reject) => {
      this.destroy();

      const peer = new Peer(this.generateRoomId(), this.buildPeerOptions(settings));
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
          this.initSender(settings, attempt + 1).then(resolve, reject);
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

    if (conn.open) {
      this.handlers.onIncomingConnection?.(conn);
    } else {
      conn.on('open', () => {
        this.handlers.onIncomingConnection?.(conn);
      });
    }

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
