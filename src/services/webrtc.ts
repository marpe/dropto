import Peer from 'peerjs';
import type { DataConnection, PeerOptions } from 'peerjs';
import type { AppSettings } from '../types/transfer';

export type ConnectionEventHandler = {
  onRoomReady?: (roomId: string) => void;
  onIncomingConnection?: (conn: DataConnection) => void;
  onConnected?: (conn: DataConnection) => void;
  onDisconnected?: () => void;
  onError?: (err: any) => void;
};

export class WebRtcService {
  private peer: Peer | null = null;
  public activeConn: DataConnection | null = null;
  public roomId: string | null = null;
  private handlers: ConnectionEventHandler = {};

  // Standard Google public STUN servers for reliable direct NAT traversal
  private defaultIceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  public generateRoomId(): string {
    // 32 symbols divide 256 evenly, so `byte % 32` is unbiased
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
    return `DW-${code}`;
  }

  public initSender(settings?: Partial<AppSettings>, customRoomId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.destroy();

      const roomId = customRoomId || this.generateRoomId();
      this.roomId = roomId;

      const peerOptions = this.buildPeerOptions(settings);

      try {
        const peer = new Peer(roomId, peerOptions);
        this.peer = peer;

        peer.on('open', (id) => {
          this.roomId = id;
          this.handlers.onRoomReady?.(id);
          resolve(id);
        });

        peer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });

        peer.on('error', (err) => {
          console.error('PeerJS error:', err);
          if (err.type === 'unavailable-id') {
            // ID collided, retry with new ID
            this.initSender(settings).then(resolve).catch(reject);
          } else {
            this.handlers.onError?.(err);
            reject(err);
          }
        });

        peer.on('close', () => {
          this.handlers.onDisconnected?.();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public initReceiver(targetRoomId: string, settings?: Partial<AppSettings>): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      this.destroy();

      const peerOptions = this.buildPeerOptions(settings);
      // Receiver gets an ephemeral random ID
      const peer = new Peer(peerOptions);
      this.peer = peer;

      peer.on('open', (_id) => {
        const conn = peer.connect(targetRoomId, {
          reliable: true,
        });

        if (conn.open) {
          this.activeConn = conn;
          this.handlers.onConnected?.(conn);
          resolve(conn);
        } else {
          conn.on('open', () => {
            this.activeConn = conn;
            this.handlers.onConnected?.(conn);
            resolve(conn);
          });
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

  public setHandlers(handlers: ConnectionEventHandler) {
    this.handlers = handlers;
  }

  private handleIncomingConnection(conn: DataConnection) {
    if (conn.open) {
      this.activeConn = conn;
      this.handlers.onIncomingConnection?.(conn);
    } else {
      conn.on('open', () => {
        this.activeConn = conn;
        this.handlers.onIncomingConnection?.(conn);
      });
    }

    conn.on('close', () => {
      this.activeConn = null;
      this.handlers.onDisconnected?.();
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

  public destroy() {
    if (this.activeConn) {
      try {
        this.activeConn.close();
      } catch (e) {}
      this.activeConn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    this.roomId = null;
  }
}

export const webrtcService = new WebRtcService();
