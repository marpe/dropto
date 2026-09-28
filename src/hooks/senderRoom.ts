import type { DataConnection } from 'peerjs';
import { describePeerError } from '../services/peerErrors';
import { sendControlMessage } from '../services/transfer/protocol';
import type { ReceiverGreeting } from '../services/webrtc';
import type { AppSettings, DownloadInterruption, TransferFile } from '../types/transfer';
import type { PeerDetails, SharingOptions } from '../types/sharing';
import { generateShareKey } from '../utils/shareLink';
import { recallRoom, rememberRoom } from '../utils/roomMemory';
import { CONNECTION_LOST_MESSAGE } from './senderState';
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

interface QueuedReceiver {
  conn: DataConnection;
  /** Called with a free slot */
  start: () => void;
}

/** How long a download cut off by a dropped connection keeps its slot for the same tab to come back */
export const RESERVED_SLOT_MS = 60_000;

interface Reservation {
  /** The receiver's latest connection; moves when the same tab comes back */
  peerId: string;
  /** Held a download slot when cut off (not just a place in line) */
  hasSlot: boolean;
  timer: ReturnType<typeof setTimeout>;
}

// A connection back to carry on a cut-off download, gone again before it did: nothing more was finished
const NOTHING_FINISHED: DownloadInterruption = { finishedCount: 0, corruptedFiles: [], resume: null };

// Three attempts per connection, three connections: then guessing has to stop
const MAX_PIN_LOCKOUTS_PER_ROOM = 3;
export const PIN_LOCKOUT_NOTICE =
  'Too many wrong PINs, so the link changed. Share the new one.';
export const DECLINED_MESSAGE = 'The sender declined your request.';
export const PIN_LOCKDOWN_NOTICE =
  'Too many wrong PINs. New connections now need your approval.';

/**
 * Everyone connected to the sender's room: people waiting for the sender's OK, and one transfer engine
 * per person let in. Anyone let in may browse and choose; only downloads take a slot, and a download
 * started while every slot is taken waits in line. Admission rules live here; the session reducer only
 * mirrors what happens, through `dispatch`.
 */
export class SenderRoom {
  private readonly services: SessionServices;
  private readonly dispatch: (action: SenderAction) => void;
  private config: RoomConfig;
  private settings: AppSettings | null = null;
  private connection: SessionConnection | null = null;
  private roomCode: string | null = null;
  private shareKey: string | null = null;
  private readonly pending = new Map<string, { conn: DataConnection; isTrusted: boolean }>();
  // Downloads started while every slot was taken, in the order they were started
  private queue: QueuedReceiver[] = [];
  // One engine per admitted receiver, kept after a finished download so they can download again
  private readonly engines = new Map<string, SessionSender>();
  // Receivers downloading, each holding a slot
  private readonly busy = new Set<string>();
  // How each connected receiver introduced itself, plus its address once known
  private readonly details = new Map<string, PeerDetails>();
  // Each connection's browser tab (from its HELLO), and the connection each tab was last let in on
  private readonly sessionOf = new Map<string, string>();
  private readonly lastConnOfSession = new Map<string, DataConnection>();
  // Downloads cut off by a dropped connection, by browser tab, until they carry on or give up
  private readonly reservations = new Map<string, Reservation>();
  private readonly reservedSlotMs: number;
  // Device effects (wake lock, sounds) span from the first slot taken to the last one freed
  private isRunning = false;
  private pinLockouts = 0;

  constructor(
    services: SessionServices,
    dispatch: (action: SenderAction) => void,
    config: RoomConfig,
    { reservedSlotMs = RESERVED_SLOT_MS }: { reservedSlotMs?: number } = {}
  ) {
    this.services = services;
    this.dispatch = dispatch;
    this.config = config;
    this.reservedSlotMs = reservedSlotMs;
  }

  /** Takes the sender's latest choices and applies what they change for people already here. */
  public configure(config: RoomConfig) {
    const previous = this.config;
    this.config = config;
    if (config.isShared !== previous.isShared && this.roomCode && this.shareKey) {
      rememberRoom({ roomCode: this.roomCode, shareKey: this.shareKey, isShared: config.isShared });
    }
    if (config.files !== previous.files) {
      // Engines still waiting for their receiver to choose re-offer the list; the others ignore it
      this.engines.forEach((engine) => engine.updateFiles(config.files));
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
        const isReused = remembered?.roomCode === roomCode;
        const shareKey = isReused ? remembered.shareKey : generateShareKey();
        const wasShared = isReused && remembered.isShared;
        this.roomCode = roomCode;
        this.shareKey = shareKey;
        rememberRoom({ roomCode, shareKey, isShared: wasShared });
        this.dispatch({ type: 'ROOM_READY', roomCode, shareKey, wasShared });
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

  /** Lets in someone waiting for the sender's OK. */
  public approve(peerId: string) {
    const held = this.pending.get(peerId);
    // Even with no files yet: the receiver waits on an empty list, and files added later are re-offered
    if (!held) {
      return;
    }
    this.pending.delete(peerId);
    this.dispatch({ type: 'PEER_ANSWERED', peerId });
    this.admit(held.conn);
  }

  public reject(peerId: string) {
    const held = this.pending.get(peerId);
    this.pending.delete(peerId);
    if (held) {
      // Said out loud before closing: a plain close looks like the sender going away, which receivers retry
      sendControlMessage(held.conn, { type: 'ERROR', payload: { message: DECLINED_MESSAGE } });
      this.connection?.disconnectPeer(peerId);
    }
    this.dispatch({ type: 'PEER_ANSWERED', peerId });
  }

  public togglePause(peerId: string) {
    this.engines.get(peerId)?.togglePause();
  }

  /** Disconnects one person: their download stops, or they leave the line. */
  public stop(peerId: string) {
    const sessionId = this.sessionOf.get(peerId);
    const engine = this.engines.get(peerId);
    if (!engine && !this.isReconnecting(peerId)) {
      return;
    }
    // Sent away on purpose: coming back from the same tab must not skip the approval they would otherwise need
    if (sessionId) {
      this.lastConnOfSession.delete(sessionId);
      this.clearReservation(sessionId);
    }
    engine?.cancel();
    this.connection?.disconnectPeer(peerId);
    this.dispatch({ type: 'RECEIVER_REMOVED', peerId });
    this.endEngine(peerId, false);
  }

  /** Disconnects everyone let in, including anyone reconnecting; people waiting for the sender's OK stay. */
  public stopAll() {
    // The line first, so freed slots are not handed to someone about to be stopped
    this.queue = [];
    const reconnecting = [...this.reservations.values()].map((reservation) => reservation.peerId);
    new Set([...this.engines.keys(), ...reconnecting]).forEach((peerId) => this.stop(peerId));
  }

  /** Ends the current share: everyone is disconnected, and nobody is recognised in the next one. */
  public endShare() {
    this.stopAll();
    this.pending.clear();
    this.connection?.disconnectPeer();
    this.dispatch({ type: 'PEER_DISCONNECTED' });
    this.lastConnOfSession.clear();
  }

  private teardown() {
    const connection = this.connection;
    this.connection = null;
    this.reservations.forEach((reservation) => clearTimeout(reservation.timer));
    this.reservations.clear();
    this.engines.clear();
    this.busy.clear();
    this.pending.clear();
    this.queue = [];
    this.details.clear();
    this.sessionOf.clear();
    this.lastConnOfSession.clear();
    this.roomCode = null;
    this.shareKey = null;
    this.pinLockouts = 0;
    this.endEffects(false);
    connection?.destroy();
  }

  private handleIncoming(conn: DataConnection, greeting: ReceiverGreeting) {
    const { files, options, isShared } = this.config;
    this.services.effects.onPeerConnected();
    const { device, timeZone, formFactor, model, storage } = greeting;
    this.details.set(conn.peer, { device: device ?? null, timeZone: timeZone ?? null, ip: null, formFactor, model, storage });
    if (greeting.sessionId) {
      this.sessionOf.set(conn.peer, greeting.sessionId);
    }
    void this.lookUpAddress(conn);
    const hasLinkKey = greeting.shareKey !== null && greeting.shareKey === this.shareKey;
    // A tab let in before, coming back (a reload, a dropped connection), was already accepted
    const isReturning = !!greeting.sessionId && this.lastConnOfSession.has(greeting.sessionId);
    const isTrusted = isReturning || (hasLinkKey && !options.requireApproval);
    if (isTrusted && isShared && files.length > 0) {
      this.admit(conn);
      return;
    }
    // Held until the link exists and files are queued, or (when not trusted) until the sender answers
    this.pending.set(conn.peer, { conn, isTrusted });
    this.dispatch({ type: 'PEER_REQUESTED', peerId: conn.peer, isTrusted, details: this.detailsOf(conn.peer) });
  }

  private handleDisconnected(peerId?: string) {
    const queueLength = this.queue.length;
    if (peerId === undefined) {
      this.pending.clear();
      this.queue = [];
    } else {
      this.pending.delete(peerId);
      this.queue = this.queue.filter(({ conn }) => conn.peer !== peerId);
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

  private detailsOf(peerId: string): PeerDetails {
    return this.details.get(peerId) ?? { device: null, timeZone: null, ip: null };
  }

  /** The address and route only show once ICE has settled on them, so they follow the rest of the details. */
  private async lookUpAddress(conn: DataConnection) {
    const connection = this.connection;
    const address = await this.services.readAddress(conn);
    const known = this.details.get(conn.peer);
    if (!address || !known || this.connection !== connection) {
      return;
    }
    this.details.set(conn.peer, { ...known, ip: address.ip, route: address.route });
    this.dispatch({ type: 'PEER_ADDRESS', peerId: conn.peer, ip: address.ip, route: address.route });
  }

  private hasFreeSlot(): boolean {
    return this.busy.size < this.config.options.maxSimultaneous;
  }

  private admit(conn: DataConnection) {
    this.resumeSession(conn);
    this.startEngine(conn);
  }

  /**
   * The same browser tab back on a new connection (after a reload or a dropped connection) takes over its
   * earlier place in the list. While that earlier connection is still open (e.g. a duplicated tab), the
   * newcomer counts as someone else.
   */
  private resumeSession(conn: DataConnection) {
    const sessionId = this.sessionOf.get(conn.peer);
    if (!sessionId) {
      return;
    }
    const previous = this.lastConnOfSession.get(sessionId);
    if (previous?.open && previous !== conn) {
      return;
    }
    this.lastConnOfSession.set(sessionId, conn);
    if (!previous || previous === conn) {
      return;
    }
    const previousEngine = this.engines.get(previous.peer);
    if (previousEngine) {
      // Its close has not been noticed yet; the new connection replaces it
      const interruption = previousEngine.interrupt() ?? (this.isReconnecting(previous.peer) ? NOTHING_FINISHED : null);
      if (interruption) {
        this.interruptDownload(previous.peer, interruption);
      } else {
        this.connection?.disconnectPeer(previous.peer);
        this.endEngine(previous.peer, false);
      }
    }
    this.moveReservation(sessionId, conn.peer);
    this.dispatch({ type: 'RECEIVER_RESUMED', fromPeerId: previous.peer, peerId: conn.peer });
  }

  /**
   * Every download, the first or a later one: at once in the slot kept for it after a dropped connection, or with a
   * free slot, otherwise after waiting in line.
   */
  private startDownload(conn: DataConnection, engine: SessionSender, fileIndices: number[], startBytes: number) {
    const peerId = conn.peer;
    const sessionId = this.sessionOf.get(peerId);
    const reservation = sessionId ? this.reservations.get(sessionId) : undefined;
    if (sessionId && reservation) {
      clearTimeout(reservation.timer);
      this.reservations.delete(sessionId);
    }
    const start = () => {
      this.occupySlot(peerId);
      this.dispatch({ type: 'RECEIVER_STARTED', peerId, fileIndices, startBytes });
    };
    if (reservation?.hasSlot || this.hasFreeSlot()) {
      start();
      return;
    }
    engine.holdUntil(
      new Promise((resolve) => {
        this.queue.push({
          conn,
          start: () => {
            start();
            resolve();
          },
        });
      })
    );
    this.dispatch({ type: 'RECEIVER_QUEUED', peerId });
    this.announcePositions();
  }

  private occupySlot(peerId: string) {
    this.busy.add(peerId);
    if (!this.isRunning) {
      this.isRunning = true;
      this.services.effects.onTransferStarted();
    }
  }

  /** Device effects (wake lock, sounds) end with the last busy slot. */
  private releaseSlot(peerId: string, isSuccessful: boolean) {
    if (this.busy.delete(peerId) && this.busy.size === 0) {
      this.endEffects(isSuccessful);
    }
  }

  /** Starts people from the front of the line while slots are free (e.g. after one finished or the limit rose). */
  private fillSlots() {
    let hasLineMoved = false;
    while (this.queue.length > 0 && this.hasFreeSlot()) {
      const [next] = this.queue.splice(0, 1);
      next.start();
      hasLineMoved = true;
    }
    if (hasLineMoved) {
      this.announcePositions();
    }
  }

  private announcePositions() {
    this.queue.forEach(({ conn }, index) => sendControlMessage(conn, { type: 'QUEUED', payload: { position: index + 1 } }));
  }

  /** A download cut off by a dropped connection: its slot (or place) waits a while for the same tab to carry on. */
  private interruptDownload(peerId: string, interruption: DownloadInterruption) {
    this.connection?.disconnectPeer(peerId);
    this.dispatch({
      type: 'RECEIVER_INTERRUPTED',
      peerId,
      finishedCount: interruption.finishedCount,
      corruptedFiles: interruption.corruptedFiles,
    });
    const sessionId = this.sessionOf.get(peerId);
    if (!sessionId) {
      // Nothing to recognise them by if they come back
      this.dispatch({ type: 'RECEIVER_FAILED', peerId, error: CONNECTION_LOST_MESSAGE });
      this.endEngine(peerId, false);
      return;
    }
    this.engines.delete(peerId);
    this.leaveLine(peerId);
    if (this.isReconnecting(peerId)) {
      // Back, then gone again before carrying on: what was kept stays kept, on the clock it started with
      return;
    }
    const timer = setTimeout(() => this.expireReservation(sessionId), this.reservedSlotMs);
    this.reservations.set(sessionId, { peerId, hasSlot: this.busy.has(peerId), timer });
  }

  /** The same tab is back on a new connection: what was kept for it follows. */
  private moveReservation(sessionId: string, peerId: string) {
    const reservation = this.reservations.get(sessionId);
    if (!reservation) {
      return;
    }
    // Only a slot still held moves; one already given back must not be taken twice
    if (reservation.hasSlot && this.busy.delete(reservation.peerId)) {
      this.busy.add(peerId);
    }
    reservation.peerId = peerId;
  }

  /** A connection back to carry on a cut-off download that has not carried on yet. */
  private isReconnecting(peerId: string): boolean {
    const sessionId = this.sessionOf.get(peerId);
    return !!sessionId && this.reservations.get(sessionId)?.peerId === peerId;
  }

  /** Not carried on in time: someone still away failed, and the slot goes to the line. */
  private expireReservation(sessionId: string) {
    const reservation = this.reservations.get(sessionId);
    if (!reservation) {
      return;
    }
    this.reservations.delete(sessionId);
    if (!this.engines.has(reservation.peerId)) {
      this.dispatch({ type: 'RECEIVER_FAILED', peerId: reservation.peerId, error: CONNECTION_LOST_MESSAGE });
    }
    this.releaseSlot(reservation.peerId, false);
    this.afterSlotFreed();
  }

  private clearReservation(sessionId: string) {
    const reservation = this.reservations.get(sessionId);
    if (reservation) {
      clearTimeout(reservation.timer);
      this.reservations.delete(sessionId);
    }
  }

  private leaveLine(peerId: string) {
    const queueLength = this.queue.length;
    this.queue = this.queue.filter(({ conn }) => conn.peer !== peerId);
    if (this.queue.length !== queueLength) {
      this.announcePositions();
    }
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
      onReceiverStarted: ifCurrent((fileIndices, startBytes) => {
        hasReceiverStarted = true;
        this.startDownload(conn, engine, fileIndices, startBytes ?? 0);
      }),
      onConnectionLost: ifCurrent((interruption) => this.interruptDownload(peerId, interruption)),
      onMetrics: ifCurrent((metrics) => this.dispatch({ type: 'METRICS', peerId, metrics })),
      onPaused: ifCurrent((isPaused) => this.dispatch({ type: 'PAUSED', peerId, isPaused })),
      onAllCompleted: ifCurrent((result) => {
        // They stay connected and may download again, but give up their slot meanwhile
        this.dispatch({ type: 'RECEIVER_COMPLETED', peerId, result, atMs: Date.now() });
        this.releaseSlot(peerId, true);
        this.afterSlotFreed();
      }),
      onPeerLeft: ifCurrent(() => {
        if (this.isReconnecting(peerId)) {
          this.interruptDownload(peerId, NOTHING_FINISHED);
          return;
        }
        this.dispatch({ type: 'RECEIVER_LEFT', peerId });
        this.endEngine(peerId, false);
      }),
      onError: ifCurrent((error) => {
        // A receiver closing or reloading the page before downloading is not a failed transfer
        const hasLeftEarly = !hasReceiverStarted && !conn.open;
        if (hasLeftEarly && this.isReconnecting(peerId)) {
          this.interruptDownload(peerId, NOTHING_FINISHED);
          return;
        }
        this.connection?.disconnectPeer(peerId);
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
    this.dispatch({ type: 'RECEIVER_ADMITTED', peerId, details: this.detailsOf(peerId), atMs: Date.now() });
    engine.start(files, options.pin);
  }

  private endEngine(peerId: string, isSuccessful: boolean) {
    const sessionId = this.sessionOf.get(peerId);
    if (sessionId && this.isReconnecting(peerId)) {
      // Back to carry on, but ended otherwise: the slot kept for it goes back with the rest
      this.clearReservation(sessionId);
    }
    this.engines.delete(peerId);
    this.leaveLine(peerId);
    this.releaseSlot(peerId, isSuccessful);
    this.afterSlotFreed();
  }

  private afterSlotFreed() {
    if (this.pinLockouts >= MAX_PIN_LOCKOUTS_PER_ROOM) {
      this.lockDown();
    } else {
      this.fillSlots();
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
    if (this.engines.size === 0 && this.settings) {
      // Nobody else is here, so the old code and link can simply stop working
      void this.open(this.settings, { isFresh: true, notice: PIN_LOCKOUT_NOTICE });
      return;
    }
    this.config = { ...this.config, options: { ...this.config.options, requireApproval: true } };
    this.dispatch({ type: 'LOCKED_DOWN', notice: PIN_LOCKDOWN_NOTICE });
    this.fillSlots();
  }
}
