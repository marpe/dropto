import type { DataConnection } from 'peerjs';
import { soundService } from '../services/sound';
import { describePeerError } from '../services/peerErrors';
import { sendControlMessage } from '../services/transfer/protocol';
import type { ReceiverGreeting } from '../services/webrtc';
import type { AppSettings, TransferFile } from '../types/transfer';
import type { SharingOptions } from '../types/sharing';
import { generateShareKey } from '../utils/shareLink';
import { recallRoom, rememberRoom } from '../utils/roomMemory';
import type { SenderAction } from './senderState';
import type { SessionConnection, SessionSender, SessionServices } from './sessionServices';

/** What the room needs to know from the sender's current choices. */
export interface RoomConfig {
  files: TransferFile[];
  options: SharingOptions;
  isShared: boolean;
}

export interface OpenRoomOptions {
  /** Never reuse the remembered room, so its code and link stop working */
  isFresh?: boolean;
  notice?: string | null;
}

// Three attempts per connection, three connections: then guessing has to stop
const MAX_PIN_LOCKOUTS_PER_ROOM = 3;
export const PIN_LOCKOUT_NOTICE =
  'Someone entered a wrong PIN too many times, so this is a new room. Share the new code or link.';
export const PIN_LOCKDOWN_NOTICE =
  'Someone entered a wrong PIN too many times, so from now on you accept each new person yourself.';
export const BUSY_MESSAGE = 'The sender is already sending these files to someone else. Try again once they are done.';
export const LINK_USED_MESSAGE =
  'Someone already downloaded these files and this link only worked once. Ask the sender for a new one.';
export const REMOVED_MESSAGE = 'The sender stopped sharing with you.';

/**
 * Everyone connected to the sender's room: people waiting for the sender's OK, people waiting in
 * line for a download slot, and one transfer engine per person downloading. Admission rules live
 * here; the session reducer only mirrors what happens, through `dispatch`.
 */
export class SenderRoom {
  private readonly services: SessionServices;
  private readonly dispatch: (action: SenderAction) => void;
  private config: RoomConfig;
  private settings: AppSettings | null = null;
  private connection: SessionConnection | null = null;
  private shareKey: string | null = null;
  private readonly pending = new Map<string, { conn: DataConnection; isTrusted: boolean }>();
  private queue: DataConnection[] = [];
  private readonly engines = new Map<string, SessionSender>();
  // Device effects (wake lock, sounds) span from the first engine starting to the last one ending
  private isRunning = false;
  // A one-person link stops admitting anyone once somebody has downloaded the files
  private hasCompletedShare = false;
  private pinLockouts = 0;

  constructor(services: SessionServices, dispatch: (action: SenderAction) => void, config: RoomConfig) {
    this.services = services;
    this.dispatch = dispatch;
    this.config = config;
  }

  /** Takes the sender's latest choices and applies what they change for people already here. */
  public configure(config: RoomConfig) {
    const previous = this.config;
    this.config = config;
    if (config.files !== previous.files) {
      // Engines still waiting for their receiver to choose re-offer the list; the others ignore it
      this.engines.forEach((engine) => engine.updateFiles(config.files));
    }
    if (!config.options.allowMultiple) {
      this.queue.splice(0).forEach((conn) => this.turnAway(conn, BUSY_MESSAGE));
    }
    this.admitHeld();
    this.fillSlots();
  }

  public async open(settings: AppSettings, { isFresh = false, notice = null }: OpenRoomOptions = {}) {
    this.settings = settings;
    this.teardown();
    this.dispatch({ type: 'ROOM_REQUESTED', notice });

    const connection = this.services.createConnection({
      onIncomingConnection: (conn, greeting) => {
        if (this.connection === connection) {
          this.handleIncoming(conn, greeting);
        }
      },
      onDisconnected: (peerId) => {
        if (this.connection === connection) {
          this.handleDisconnected(peerId);
        }
      },
      onError: (err) => {
        console.error('WebRTC error:', err);
      },
    });
    this.connection = connection;

    try {
      const remembered = isFresh ? null : recallRoom();
      const roomCode = await connection.initSender(settings, { preferredRoomId: remembered?.roomCode });
      if (this.connection === connection) {
        // Links already handed out stay valid only while both the room and its key survive
        const shareKey = remembered?.roomCode === roomCode ? remembered.shareKey : generateShareKey();
        this.shareKey = shareKey;
        rememberRoom({ roomCode, shareKey });
        this.dispatch({ type: 'ROOM_READY', roomCode, shareKey });
      }
    } catch (err) {
      if (this.connection === connection) {
        this.dispatch({ type: 'ROOM_FAILED', error: describePeerError(err) });
      }
    }
  }

  /** Leaves the room: every connection closes and nothing from it is heard any more. */
  public close() {
    this.teardown();
  }

  /** Lets in someone waiting for the sender's OK; they take a free slot or join the line. */
  public approve(peerId: string) {
    const held = this.pending.get(peerId);
    // An empty manifest would leave both peers stuck; the request stays pending until files are added
    if (!held || this.config.files.length === 0) {
      return;
    }
    this.pending.delete(peerId);
    this.dispatch({ type: 'PEER_ANSWERED', peerId });
    this.admit(held.conn);
  }

  public reject(peerId: string) {
    const held = this.pending.get(peerId);
    this.pending.delete(peerId);
    held?.conn.close();
    this.dispatch({ type: 'PEER_ANSWERED', peerId });
  }

  public togglePause(peerId: string) {
    this.engines.get(peerId)?.togglePause();
  }

  /** Stops one person's download, or takes them out of the line. */
  public stop(peerId: string) {
    const engine = this.engines.get(peerId);
    if (engine) {
      engine.cancel();
      this.connection?.disconnectPeer(peerId);
      this.dispatch({ type: 'RECEIVER_REMOVED', peerId });
      this.endEngine(peerId, false);
      return;
    }
    const queued = this.queue.find((conn) => conn.peer === peerId);
    if (queued) {
      this.queue = this.queue.filter((conn) => conn !== queued);
      this.turnAway(queued, REMOVED_MESSAGE);
      this.announcePositions();
    }
  }

  /** Stops every download and empties the line; people waiting for the sender's OK stay. */
  public stopAll() {
    // The line first, so freed slots are not handed to someone about to be turned away
    this.queue.splice(0).forEach((conn) => this.turnAway(conn, REMOVED_MESSAGE));
    [...this.engines.keys()].forEach((peerId) => this.stop(peerId));
  }

  /** Ends the current share: everyone is disconnected, and a one-person link may be used again. */
  public endShare() {
    this.stopAll();
    this.pending.clear();
    this.connection?.disconnectPeer();
    this.dispatch({ type: 'PEER_DISCONNECTED' });
    this.hasCompletedShare = false;
  }

  private teardown() {
    const connection = this.connection;
    this.connection = null;
    this.engines.clear();
    this.pending.clear();
    this.queue = [];
    this.shareKey = null;
    this.hasCompletedShare = false;
    this.pinLockouts = 0;
    this.endEffects(false);
    connection?.destroy();
  }

  private handleIncoming(conn: DataConnection, greeting: ReceiverGreeting) {
    const { files, options, isShared } = this.config;
    if (!options.allowMultiple) {
      if (this.hasCompletedShare) {
        this.turnAway(conn, LINK_USED_MESSAGE);
        return;
      }
      if (this.engines.size > 0 || this.pending.size > 0) {
        this.turnAway(conn, BUSY_MESSAGE);
        return;
      }
    }
    soundService.playConnect();
    const hasLinkKey = greeting.shareKey !== null && greeting.shareKey === this.shareKey;
    const isTrusted = hasLinkKey && !options.requireApproval;
    if (isTrusted && isShared && files.length > 0) {
      this.admit(conn);
      return;
    }
    // Held until the link exists and files are queued, or (when not trusted) until the sender answers
    this.pending.set(conn.peer, { conn, isTrusted });
    this.dispatch({ type: 'PEER_REQUESTED', peerId: conn.peer, isTrusted });
  }

  private handleDisconnected(peerId?: string) {
    const queueLength = this.queue.length;
    if (peerId === undefined) {
      this.pending.clear();
      this.queue = [];
    } else {
      this.pending.delete(peerId);
      this.queue = this.queue.filter((conn) => conn.peer !== peerId);
    }
    this.dispatch({ type: 'PEER_DISCONNECTED', peerId });
    if (this.queue.length !== queueLength) {
      this.announcePositions();
    }
  }

  /** A trusted early arrival is let in once the link exists and there is something to send. */
  private admitHeld() {
    const { files, isShared } = this.config;
    if (!isShared || files.length === 0) {
      return;
    }
    for (const [peerId, held] of this.pending) {
      if (held.isTrusted) {
        this.pending.delete(peerId);
        this.dispatch({ type: 'PEER_ANSWERED', peerId });
        this.admit(held.conn);
      }
    }
  }

  private capacity(): number {
    const { allowMultiple, maxSimultaneous } = this.config.options;
    return allowMultiple ? maxSimultaneous : 1;
  }

  private admit(conn: DataConnection) {
    if (this.engines.size < this.capacity()) {
      this.startEngine(conn);
      return;
    }
    if (!this.config.options.allowMultiple) {
      this.turnAway(conn, BUSY_MESSAGE);
      return;
    }
    this.queue.push(conn);
    this.dispatch({ type: 'RECEIVER_QUEUED', peerId: conn.peer });
    this.announcePositions();
  }

  /** Starts people from the front of the line while slots are free (e.g. after one finished or the limit rose). */
  private fillSlots() {
    let hasLineMoved = false;
    while (this.queue.length > 0 && this.engines.size < this.capacity()) {
      const [next] = this.queue.splice(0, 1);
      this.startEngine(next);
      hasLineMoved = true;
    }
    if (hasLineMoved) {
      this.announcePositions();
    }
  }

  private announcePositions() {
    this.queue.forEach((conn, index) => sendControlMessage(conn, { type: 'QUEUED', payload: { position: index + 1 } }));
  }

  /** Tells the receiver why before closing, so it can show the reason instead of a lost connection. */
  private turnAway(conn: DataConnection, message: string) {
    sendControlMessage(conn, { type: 'ERROR', payload: { message } });
    this.connection?.disconnectPeer(conn.peer);
    this.dispatch({ type: 'RECEIVER_REMOVED', peerId: conn.peer });
  }

  private startEngine(conn: DataConnection) {
    const peerId = conn.peer;
    const { files, options } = this.config;
    let hasReceiverStarted = false;
    // Events from an engine that has since been stopped or replaced are ignored
    const ifCurrent =
      <A extends unknown[]>(handler: (...args: A) => void) =>
      (...args: A) => {
        if (this.engines.get(peerId) === engine) {
          handler(...args);
        }
      };

    const engine = this.services.createSender(conn, {
      onPinLockout: ifCurrent(() => {
        this.pinLockouts += 1;
      }),
      onReceiverStarted: ifCurrent((fileIndices) => {
        hasReceiverStarted = true;
        this.dispatch({ type: 'RECEIVER_STARTED', peerId, fileIndices });
      }),
      onMetrics: ifCurrent((metrics) => this.dispatch({ type: 'METRICS', peerId, metrics })),
      onPaused: ifCurrent((isPaused) => this.dispatch({ type: 'PAUSED', peerId, isPaused })),
      onAllCompleted: ifCurrent((result) => {
        this.hasCompletedShare = true;
        this.dispatch({ type: 'RECEIVER_COMPLETED', peerId, result });
        this.endEngine(peerId, true);
      }),
      onError: ifCurrent((error) => {
        this.connection?.disconnectPeer(peerId);
        // A receiver closing or reloading the page before downloading is not a failed transfer
        const hasLeftEarly = !hasReceiverStarted && !conn.open;
        this.dispatch(hasLeftEarly ? { type: 'RECEIVER_REMOVED', peerId } : { type: 'RECEIVER_FAILED', peerId, error });
        this.endEngine(peerId, false);
      }),
      onCancelled: ifCurrent(() => {
        this.connection?.disconnectPeer(peerId);
        this.dispatch({ type: 'RECEIVER_REMOVED', peerId });
        this.endEngine(peerId, false);
      }),
    });
    this.engines.set(peerId, engine);
    if (!this.isRunning) {
      this.isRunning = true;
      this.services.effects.onTransferStarted();
    }
    this.dispatch({ type: 'RECEIVER_ADMITTED', peerId });
    engine.start(files, options.pin);
  }

  private endEngine(peerId: string, isSuccessful: boolean) {
    this.engines.delete(peerId);
    if (this.pinLockouts >= MAX_PIN_LOCKOUTS_PER_ROOM) {
      this.lockDown();
    } else {
      this.fillSlots();
    }
    if (this.engines.size === 0) {
      this.endEffects(isSuccessful);
    }
  }

  private endEffects(isSuccessful: boolean) {
    if (this.isRunning) {
      this.isRunning = false;
      this.services.effects.onTransferEnded(isSuccessful);
    }
  }

  /** Stops PIN guessing without cutting off anyone downloading through this room. */
  private lockDown() {
    this.pinLockouts = 0;
    if (this.engines.size === 0 && this.queue.length === 0 && this.settings) {
      // Nobody else is here, so the old code and link can simply stop working
      void this.open(this.settings, { isFresh: true, notice: PIN_LOCKOUT_NOTICE });
      return;
    }
    this.config = { ...this.config, options: { ...this.config.options, requireApproval: true } };
    this.dispatch({ type: 'LOCKED_DOWN', notice: PIN_LOCKDOWN_NOTICE });
    this.fillSlots();
  }
}
