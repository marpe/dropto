import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DataConnection } from 'peerjs';
import { TransferSender } from '../services/transfer/sender';
import { TransferReceiver } from '../services/transfer/receiver';
import type { ReceiverOptions, ResumePoint } from '../services/transfer/receiver';
import { CHUNK_HEADER_SIZE, encodeChunk } from '../services/transfer/protocol';
import { FastStreamingChecksum } from '../services/checksum';
import type { StorageWriter } from '../services/storage';
import type {
  DownloadInterruption,
  PinPrompt,
  ReceiverEvents,
  SenderEvents,
  TransferFile,
  TransferManifest,
  TransferMetrics,
  TransferResult,
} from '../types/transfer';
import { clearFilePickers, createMockDirectoryTree } from './utils/mockFileSystem';

class FakeDataChannel extends EventTarget {
  public binaryType = 'blob';
  public bufferedAmount = 0;
  public bufferedAmountLowThreshold = 0;
}

/** In-memory stand-in for a PeerJS DataConnection; delivery is async (microtask) and ordered. */
class MockDataConnection {
  public open = true;
  public dataChannel = new FakeDataChannel();
  public otherEnd: MockDataConnection | null = null;
  /** Optional hook to corrupt data in flight */
  public tamper: ((data: unknown) => unknown) | null = null;
  public sent: unknown[] = [];
  private listeners: Record<string, ((data: unknown) => void)[]> = {};

  public on(event: string, callback: (data: unknown) => void) {
    (this.listeners[event] ??= []).push(callback);
  }

  public send(data: unknown) {
    this.sent.push(data);
    const delivered = this.tamper ? this.tamper(data) : data;
    const target = this.otherEnd;
    if (target) {
      queueMicrotask(() => target.emit('data', delivered));
    }
  }

  public emit(event: string, data?: unknown) {
    for (const callback of this.listeners[event] ?? []) {
      callback(data);
    }
  }

  public sentMessageTypes(): string[] {
    return this.sent.filter((data): data is string => typeof data === 'string').map((data) => JSON.parse(data).type);
  }

  public sentChunkCount(): number {
    return this.sent.filter((data) => data instanceof ArrayBuffer).length;
  }
}

const asConnection = (conn: MockDataConnection) => conn as unknown as DataConnection;

function createConnectedPair() {
  const senderConn = new MockDataConnection();
  const receiverConn = new MockDataConnection();
  senderConn.otherEnd = receiverConn;
  receiverConn.otherEnd = senderConn;
  return { senderConn, receiverConn };
}

function createTestFile(sizeBytes: number, name = 'test-video.mp4', relativePath?: string): TransferFile {
  const fileBytes = new Uint8Array(sizeBytes);
  for (let i = 0; i < fileBytes.length; i++) {
    fileBytes[i] = (i * 17) & 0xff;
  }
  const rawFile = new File([fileBytes], name, { type: 'video/mp4' });
  return { id: name, name, size: rawFile.size, type: rawFile.type, relativePath, rawFile };
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadlineMs = Date.now() + timeoutMs;
  while (Date.now() < deadlineMs) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return condition();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FakeWriter extends StorageWriter {
  write: ReturnType<typeof vi.fn>;
}

function createFakeWriter(write: (chunk: Uint8Array) => Promise<void> = async () => {}): FakeWriter {
  const writeSpy = vi.fn(write);
  return {
    isNativeFSA: true,
    prepare: vi.fn().mockResolvedValue(true),
    writeChunk: writeSpy,
    write: writeSpy,
    finalize: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
  };
}

/** Storage that hands out one fake writer per file. */
function fakeStorage(write?: (chunk: Uint8Array) => Promise<void>) {
  const writers: FakeWriter[] = [];
  const chooseStorage: ReceiverOptions['chooseStorage'] = async () => () => {
    const writer = createFakeWriter(write);
    writers.push(writer);
    return writer;
  };
  return { chooseStorage, writers };
}

interface PairOptions {
  senderEvents?: SenderEvents;
  receiverEvents?: ReceiverEvents;
  receiverOptions?: ReceiverOptions;
  /** Start receiving as soon as the manifest arrives, like a user clicking the save button */
  isAutoReceiving?: boolean;
}

/** A connected sender/receiver pair that records errors and results on both sides. */
function createTransferPair({
  senderEvents = {},
  receiverEvents = {},
  receiverOptions = { chooseStorage: fakeStorage().chooseStorage },
  isAutoReceiving = true,
}: PairOptions = {}) {
  const { senderConn, receiverConn } = createConnectedPair();
  const record = {
    senderErrors: [] as string[],
    receiverErrors: [] as string[],
    senderResult: null as TransferResult | null,
    receiverResult: null as TransferResult | null,
  };
  const receiver: TransferReceiver = new TransferReceiver(
    asConnection(receiverConn),
    {
      ...receiverEvents,
      onManifest: (manifest) => {
        receiverEvents.onManifest?.(manifest);
        if (isAutoReceiving) {
          void receiver.startReceiving();
        }
      },
      onAllCompleted: (result) => {
        record.receiverResult = result;
        receiverEvents.onAllCompleted?.(result);
      },
      onError: (message) => {
        record.receiverErrors.push(message);
        receiverEvents.onError?.(message);
      },
    },
    receiverOptions
  );
  const sender = new TransferSender(asConnection(senderConn), {
    ...senderEvents,
    onAllCompleted: (result) => {
      record.senderResult = result;
      senderEvents.onAllCompleted?.(result);
    },
    onError: (message) => {
      record.senderErrors.push(message);
      senderEvents.onError?.(message);
    },
  });
  const isComplete = () => record.senderResult !== null && record.receiverResult !== null;
  return { sender, receiver, senderConn, receiverConn, record, isComplete };
}

/** Receiver driven by a scripted fake sender that emits raw protocol data. */
async function startReceiverWithFakeSender(fileSizes: number[], events: ReceiverEvents = {}) {
  const storage = fakeStorage();
  const receiverConn = new MockDataConnection();
  const errors: string[] = [];
  const receiver = new TransferReceiver(
    asConnection(receiverConn),
    {
      ...events,
      onError: (message) => {
        errors.push(message);
        events.onError?.(message);
      },
    },
    { chooseStorage: storage.chooseStorage }
  );
  const manifest: TransferManifest = {
    totalBytes: fileSizes.reduce((sum, size) => sum + size, 0),
    files: fileSizes.map((size, i) => ({ id: `f${i}`, name: `f${i}.bin`, size, type: 'application/octet-stream' })),
  };
  const emit = async (data: ArrayBuffer | string) => {
    receiverConn.emit('data', data);
    await sleep(10);
  };
  await emit(JSON.stringify({ type: 'MANIFEST', payload: manifest }));
  await receiver.startReceiving();
  return { emit, errors, storage, receiver, receiverConn };
}

describe('full transfer', () => {
  it('delivers a multi-chunk file and verifies its checksum on both sides', async () => {
    const receivedFiles: [number, boolean][] = [];
    const pair = createTransferPair({
      receiverEvents: {
        onFileComplete: (fileIndex, isVerified) => {
          receivedFiles.push([fileIndex, isVerified]);
        },
      },
    });

    // 150KB spans 3 x 64KB chunks
    pair.sender.start([createTestFile(150 * 1024)]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(receivedFiles).toEqual([[0, true]]);
    expect(pair.record.senderResult).toEqual({ corruptedFiles: [] });
  });

  it('announces the incoming manifest to the receiver', async () => {
    let received: TransferManifest | null = null;
    const pair = createTransferPair({
      isAutoReceiving: false,
      receiverEvents: {
        onManifest: (manifest) => {
          received = manifest;
        },
      },
    });

    pair.sender.start([createTestFile(1024, 'a.bin'), createTestFile(2048, 'b.bin', 'dir/b.bin')]);

    expect(await waitFor(() => received !== null)).toBe(true);
    expect(received!.totalBytes).toBe(3072);
    expect(received!.files.map((f) => [f.name, f.size, f.relativePath])).toEqual([
      ['a.bin', 1024, undefined],
      ['b.bin', 2048, 'dir/b.bin'],
    ]);
  });

  it('completes the sender only after the last of several files is acknowledged', async () => {
    const senderEvents: string[] = [];
    const pair = createTransferPair({
      senderEvents: {
        onFileComplete: (fileIndex) => {
          senderEvents.push(`file:${fileIndex}`);
        },
        onAllCompleted: () => {
          senderEvents.push('all');
        },
      },
    });

    pair.sender.start([createTestFile(100 * 1024, 'a.bin'), createTestFile(70 * 1024, 'b.bin')]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(senderEvents).toEqual(['file:0', 'file:1', 'all']);
  });

  it('transfers an empty file', async () => {
    const pair = createTransferPair();

    pair.sender.start([createTestFile(0, 'empty.txt')]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(pair.record.receiverResult).toEqual({ corruptedFiles: [] });
  });
});

describe('introduction and live file list', () => {
  function helloPayloads(conn: MockDataConnection) {
    return conn.sent
      .filter((data): data is string => typeof data === 'string')
      .map((data) => JSON.parse(data))
      .filter((message) => message.type === 'HELLO')
      .map((message) => message.payload);
  }

  it('greets the sender first, presenting the share key from the link', () => {
    const receiverConn = new MockDataConnection();

    new TransferReceiver(asConnection(receiverConn), {}, { shareKey: 'secret-key' });

    expect(receiverConn.sentMessageTypes()[0]).toBe('HELLO');
    expect(helloPayloads(receiverConn)).toEqual([{ shareKey: 'secret-key' }]);
  });

  it('tells the user their place in line while the sender is busy with others', async () => {
    const places: number[] = [];
    const receiverConn = new MockDataConnection();
    new TransferReceiver(asConnection(receiverConn), { onQueued: (position) => places.push(position) });

    receiverConn.emit('data', JSON.stringify({ type: 'QUEUED', payload: { position: 2 } }));
    receiverConn.emit('data', JSON.stringify({ type: 'QUEUED', payload: { position: 1 } }));

    expect(await waitFor(() => places.length === 2)).toBe(true);
    expect(places).toEqual([2, 1]);
  });

  it('introduces its device, time zone and tab, so the sender can tell people apart and recognise them', () => {
    const receiverConn = new MockDataConnection();
    const introduction = {
      device: 'Chrome on Android',
      timeZone: 'Europe/Stockholm',
      sessionId: '0f8c3b4e-7a52-4d0b-9a57-2d1c6e8b9f10',
      formFactor: 'phone',
      model: 'Pixel 8',
      storage: 'memory',
    } as const;

    new TransferReceiver(asConnection(receiverConn), {}, { shareKey: 'k', introduction });

    expect(helloPayloads(receiverConn)).toEqual([{ shareKey: 'k', ...introduction }]);
  });

  it('leaves out what it does not know about itself', () => {
    const receiverConn = new MockDataConnection();

    new TransferReceiver(asConnection(receiverConn), {}, {
      shareKey: 'k',
      introduction: { device: null, timeZone: null, sessionId: null, formFactor: null, model: null, storage: 'disk' },
    });

    expect(helloPayloads(receiverConn)).toEqual([{ shareKey: 'k', storage: 'disk' }]);
  });

  it('greets without a key when the room code was typed in', () => {
    const receiverConn = new MockDataConnection();

    new TransferReceiver(asConnection(receiverConn), {});

    expect(helloPayloads(receiverConn)).toEqual([{ shareKey: null }]);
  });

  it('shows the receiver an updated file list until the download starts', async () => {
    const manifests: TransferManifest[] = [];
    const pair = createTransferPair({
      isAutoReceiving: false,
      receiverEvents: {
        onManifest: (manifest) => {
          manifests.push(manifest);
        },
      },
    });
    const first = createTestFile(1024, 'a.bin');
    pair.sender.start([first]);
    await waitFor(() => manifests.length === 1);

    pair.sender.updateFiles([first, createTestFile(2048, 'b.bin')]);
    await waitFor(() => manifests.length === 2);
    await pair.receiver.startReceiving();

    expect(manifests[1].files.map((file) => file.name)).toEqual(['a.bin', 'b.bin']);
    expect(await waitFor(pair.isComplete)).toBe(true);
  });

  it('tells the sender once the receiver starts downloading, and freezes the file list', async () => {
    let receiverStartedCount = 0;
    const manifests: TransferManifest[] = [];
    const pair = createTransferPair({
      senderEvents: {
        onReceiverStarted: () => {
          receiverStartedCount++;
        },
      },
      receiverEvents: {
        onManifest: (manifest) => {
          manifests.push(manifest);
        },
      },
    });
    const files = [createTestFile(1024, 'a.bin'), createTestFile(1024, 'b.bin')];

    pair.sender.start(files);
    await waitFor(() => receiverStartedCount > 0);
    pair.sender.updateFiles([...files, createTestFile(1024, 'late.bin')]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(receiverStartedCount).toBe(1);
    expect(manifests).toHaveLength(1);
  });

  // A destination picked for one file (a save dialog) cannot hold a list that has since grown
  it('asks again when the file list changes while the save location is being chosen', async () => {
    const receiverConn = new MockDataConnection();
    let finishChoosing: () => void = () => {};
    const receiver = new TransferReceiver(
      asConnection(receiverConn),
      {},
      {
        chooseStorage: async () => {
          await new Promise<void>((resolve) => {
            finishChoosing = resolve;
          });
          return fakeStorage().chooseStorage([]);
        },
      }
    );
    const manifestOf = (...names: string[]): TransferManifest => ({
      totalBytes: names.length,
      files: names.map((name, i) => ({ id: `f${i}`, name, size: 1, type: 'application/octet-stream' })),
    });
    receiverConn.emit('data', JSON.stringify({ type: 'MANIFEST', payload: manifestOf('a.bin') }));
    await sleep(10);

    const starting = receiver.startReceiving();
    receiverConn.emit('data', JSON.stringify({ type: 'MANIFEST', payload: manifestOf('a.bin', 'b.bin') }));
    await sleep(10);
    finishChoosing();

    expect(await starting).toBe(false);
    expect(receiverConn.sentMessageTypes()).not.toContain('FILE_START');
  });
});

describe('choosing which files to receive', () => {
  async function offerThreeFiles(senderEvents: SenderEvents = {}, receiverEvents: ReceiverEvents = {}) {
    const storage = fakeStorage();
    let hasManifest = false;
    const pair = createTransferPair({
      isAutoReceiving: false,
      senderEvents,
      receiverEvents: {
        ...receiverEvents,
        onManifest: () => {
          hasManifest = true;
        },
      },
      receiverOptions: { chooseStorage: storage.chooseStorage },
    });
    pair.sender.start([createTestFile(1024, 'a.bin'), createTestFile(2048, 'b.bin'), createTestFile(4096, 'c.bin')]);
    await waitFor(() => hasManifest);
    return { ...pair, storage };
  }

  it('transfers only the selected files and completes on both sides', async () => {
    let receiverStartedWith: number[] = [];
    const session = await offerThreeFiles({
      onReceiverStarted: (fileIndices) => {
        receiverStartedWith = fileIndices;
      },
    });

    expect(await session.receiver.startReceiving([0, 2])).toBe(true);

    expect(await waitFor(session.isComplete)).toBe(true);
    expect(session.storage.writers.map((writer) => vi.mocked(writer.prepare).mock.calls[0][0])).toEqual([
      'a.bin',
      'c.bin',
    ]);
    expect(receiverStartedWith).toEqual([0, 2]);
    expect(session.record.senderErrors).toEqual([]);
  });

  it('sizes progress to the selection, counting positions within it', async () => {
    const snapshots: TransferMetrics[] = [];
    const session = await offerThreeFiles({}, { onMetrics: (metrics) => snapshots.push(metrics) });

    await session.receiver.startReceiving([2]);
    await waitFor(session.isComplete);

    const last = snapshots[snapshots.length - 1];
    expect(last).toMatchObject({ totalBytes: 4096, totalFiles: 1, currentFileIndex: 0, currentFileName: 'c.bin' });
  });

  it('receives everything when no selection is given', async () => {
    let receiverStartedWith: number[] = [];
    const session = await offerThreeFiles({
      onReceiverStarted: (fileIndices) => {
        receiverStartedWith = fileIndices;
      },
    });

    await session.receiver.startReceiving();

    expect(await waitFor(session.isComplete)).toBe(true);
    expect(receiverStartedWith).toEqual([0, 1, 2]);
    expect(session.storage.writers).toHaveLength(3);
  });

  it('refuses a selection that names files the sender never offered', async () => {
    const session = await offerThreeFiles();

    session.receiverConn.send(JSON.stringify({ type: 'FILE_SELECTION', payload: { fileIndices: [7] } }));

    expect(await waitFor(() => session.record.senderErrors.length > 0)).toBe(true);
  });
});

describe('downloading again on the same connection', () => {
  async function finishFirstDownload(senderEvents: SenderEvents = {}, receiverEvents: ReceiverEvents = {}) {
    const storage = fakeStorage();
    let manifests: TransferManifest[] = [];
    const pair = createTransferPair({
      isAutoReceiving: false,
      senderEvents,
      receiverEvents: {
        ...receiverEvents,
        onManifest: (manifest) => {
          manifests = [...manifests, manifest];
        },
      },
      receiverOptions: { chooseStorage: storage.chooseStorage },
    });
    pair.sender.start([createTestFile(1024, 'a.bin'), createTestFile(2048, 'b.bin'), createTestFile(4096, 'c.bin')]);
    await waitFor(() => manifests.length > 0);
    await pair.receiver.startReceiving([0]);
    await waitFor(pair.isComplete);
    pair.record.senderResult = null;
    pair.record.receiverResult = null;
    return { ...pair, storage, manifests: () => manifests };
  }

  it('lets the receiver pick and download more files after finishing', async () => {
    const started: number[][] = [];
    const session = await finishFirstDownload({ onReceiverStarted: (fileIndices) => started.push(fileIndices) });

    expect(await session.receiver.startReceiving([2])).toBe(true);

    expect(await waitFor(session.isComplete)).toBe(true);
    expect(started).toEqual([[0], [2]]);
    expect(session.storage.writers.map((writer) => vi.mocked(writer.prepare).mock.calls[0][0])).toEqual(['a.bin', 'c.bin']);
    expect(session.record.senderErrors).toEqual([]);
    expect(session.record.receiverErrors).toEqual([]);
  });

  it('downloads the same files again, sized to the new download', async () => {
    const snapshots: TransferMetrics[] = [];
    const session = await finishFirstDownload({}, { onMetrics: (metrics) => snapshots.push(metrics) });

    await session.receiver.startReceiving();

    expect(await waitFor(session.isComplete)).toBe(true);
    expect(snapshots.at(-1)).toMatchObject({ totalBytes: 1024 + 2048 + 4096, totalFiles: 3 });
    expect(session.storage.writers).toHaveLength(4);
  });

  it('shows the receiver files the sender adds after a download finished', async () => {
    const session = await finishFirstDownload();

    const isUpdated = session.sender.updateFiles([
      createTestFile(1024, 'a.bin'),
      createTestFile(2048, 'b.bin'),
      createTestFile(4096, 'c.bin'),
      createTestFile(512, 'd.bin'),
    ]);

    expect(isUpdated).toBe(true);
    expect(await waitFor(() => session.manifests().length === 2)).toBe(true);
    expect(session.manifests()[1].files.map((file) => file.name)).toContain('d.bin');
    expect(session.record.receiverErrors).toEqual([]);
  });
});

describe('pause and resume', () => {
  const fileChunksSent = (conn: MockDataConnection) => conn.sent.filter((data) => typeof data !== 'string').length;

  it('holds file data while paused and finishes after resuming', async () => {
    const pair = createTransferPair();
    pair.sender.togglePause();
    pair.sender.start([createTestFile(3 * 64 * 1024)]);
    await sleep(50);
    expect(fileChunksSent(pair.senderConn)).toBe(0);

    pair.sender.togglePause();

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(fileChunksSent(pair.senderConn)).toBe(3);
  });

  // Hidden tabs throttle timers to once a second (or once a minute), so a polling loop would stall resume
  it('waits for resume without scheduling timers', async () => {
    const pair = createTransferPair();
    pair.sender.togglePause();
    pair.sender.start([createTestFile(64 * 1024)]);
    await sleep(20);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const PAUSED_FOR_MS = 250;
    await sleep(PAUSED_FOR_MS);
    const timersWhilePaused = setTimeoutSpy.mock.calls.filter(([, delayMs]) => delayMs !== PAUSED_FOR_MS).length;
    setTimeoutSpy.mockRestore();
    pair.sender.togglePause();

    expect(timersWhilePaused).toBe(0);
    expect(await waitFor(pair.isComplete)).toBe(true);
  });
});

describe('backpressure', () => {
  it('stops sending while the channel buffer is full and resumes once it drains', async () => {
    const senderConn = new MockDataConnection();
    const sender = new TransferSender(asConnection(senderConn), {});
    senderConn.dataChannel.bufferedAmount = 2 * 1024 * 1024;

    sender.start([createTestFile(3 * 64 * 1024)]);
    senderConn.emit('data', JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 0 } }));
    await sleep(30);
    expect(senderConn.sentChunkCount()).toBe(0);

    senderConn.dataChannel.bufferedAmount = 0;
    senderConn.dataChannel.dispatchEvent(new Event('bufferedamountlow'));

    expect(await waitFor(() => senderConn.sentChunkCount() === 3)).toBe(true);
  });

  it('asks the channel to signal when the buffer falls below the low watermark', () => {
    const senderConn = new MockDataConnection();

    new TransferSender(asConnection(senderConn), {});

    expect(senderConn.dataChannel.bufferedAmountLowThreshold).toBe(256 * 1024);
    expect(senderConn.dataChannel.binaryType).toBe('arraybuffer');
  });
});

describe('connection loss', () => {
  /** A pair whose receiver has started downloading, held mid-file by a disk write that never finishes. */
  async function pairMidTransfer(senderEvents: SenderEvents = {}) {
    let hasStarted = false;
    const pair = createTransferPair({
      senderEvents: {
        ...senderEvents,
        onReceiverStarted: () => {
          hasStarted = true;
        },
      },
      receiverOptions: { chooseStorage: fakeStorage(() => new Promise(() => {})).chooseStorage },
    });
    pair.sender.start([createTestFile(512 * 1024)]);
    await waitFor(() => hasStarted);
    return pair;
  }

  it('reports a dropped connection separately from errors when the UI wants to handle it', async () => {
    let losses = 0;
    const pair = await pairMidTransfer({
      onConnectionLost: () => {
        losses++;
      },
    });

    pair.senderConn.emit('close');

    expect(losses).toBe(1);
    expect(pair.record.senderErrors).toEqual([]);
  });

  it('reports an error to the sender when the connection closes mid-transfer', async () => {
    const pair = await pairMidTransfer();

    pair.senderConn.emit('close');

    expect(pair.record.senderErrors).toHaveLength(1);
  });

  it('reports a receiver leaving before it starts downloading as leaving, not an error', () => {
    const senderConn = new MockDataConnection();
    const errors: string[] = [];
    let departures = 0;
    const sender = new TransferSender(asConnection(senderConn), {
      onError: (message) => {
        errors.push(message);
      },
      onPeerLeft: () => {
        departures++;
      },
    });

    sender.start([createTestFile(10 * 1024)]);
    senderConn.emit('close');

    expect(departures).toBe(1);
    expect(errors).toEqual([]);
  });

  it('reports the sender leaving while the receiver is still choosing as leaving, not an error', async () => {
    let hasManifest = false;
    let departures = 0;
    const pair = createTransferPair({
      isAutoReceiving: false,
      receiverEvents: {
        onManifest: () => {
          hasManifest = true;
        },
        onPeerLeft: () => {
          departures++;
        },
      },
    });

    pair.sender.start([createTestFile(10 * 1024)]);
    await waitFor(() => hasManifest);
    pair.receiverConn.emit('close');

    expect(departures).toBe(1);
    expect(pair.record.receiverErrors).toEqual([]);
  });

  it('reports the connection closing after a finished download as the peer leaving, not an error', async () => {
    let departures = 0;
    const onPeerLeft = () => {
      departures++;
    };
    const pair = createTransferPair({ senderEvents: { onPeerLeft }, receiverEvents: { onPeerLeft } });

    pair.sender.start([createTestFile(10 * 1024)]);
    expect(await waitFor(pair.isComplete)).toBe(true);
    pair.senderConn.emit('close');
    pair.receiverConn.emit('close');

    expect(departures).toBe(2);
    expect(pair.record.senderErrors).toEqual([]);
    expect(pair.record.receiverErrors).toEqual([]);
  });

  it('keeps the open file when the connection drops mid-file, so the next connection can carry on', async () => {
    const storage = fakeStorage(() => new Promise<void>(() => {}));
    // An object, so TypeScript does not narrow the callback-assigned value to null
    const seen: { interruption: DownloadInterruption | null } = { interruption: null };
    let hasStarted = false;
    const pair = createTransferPair({
      senderEvents: {
        onReceiverStarted: () => {
          hasStarted = true;
        },
      },
      receiverEvents: {
        onConnectionLost: (cut) => {
          seen.interruption = cut;
        },
      },
      receiverOptions: { chooseStorage: storage.chooseStorage },
    });
    pair.sender.start([createTestFile(512 * 1024)]);
    await waitFor(() => hasStarted && storage.writers[0]?.write.mock.calls.length === 1);

    pair.receiverConn.emit('close');

    // The first chunk was handed to the writer, so it counts even though its write has not finished
    expect(seen.interruption).toMatchObject({
      finishedCount: 0,
      corruptedFiles: [],
      resume: { fileId: 'test-video.mp4', fileSize: 512 * 1024, nextChunk: 1, receivedBytes: 64 * 1024, remainingIds: ['test-video.mp4'] },
    });
    expect(seen.interruption?.resume?.writer).toBe(storage.writers[0]);
    expect(storage.writers[0].abort).not.toHaveBeenCalled();
    expect(pair.record.receiverErrors).toEqual([]);
  });

  it('tells both sides how many files were finished before the cut', async () => {
    let writes = 0;
    // The first file (2 chunks) is written; the second hangs on its first chunk
    const storage = fakeStorage(() => (++writes > 2 ? new Promise<void>(() => {}) : Promise.resolve()));
    let senderCut: DownloadInterruption | null = null;
    let finishedOnSender = 0;
    const pair = createTransferPair({
      senderEvents: {
        onFileComplete: () => {
          finishedOnSender++;
        },
        onConnectionLost: (cut) => {
          senderCut = cut;
        },
      },
      receiverOptions: { chooseStorage: storage.chooseStorage },
    });
    pair.sender.start([createTestFile(100 * 1024, 'a.bin'), createTestFile(100 * 1024, 'b.bin')]);
    await waitFor(() => finishedOnSender === 1 && writes === 3);

    pair.senderConn.emit('close');

    expect(senderCut).toEqual({ finishedCount: 1, corruptedFiles: [], resume: null });
  });

  it('ends at once when told the connection is being replaced, returning what can carry on', async () => {
    const storage = fakeStorage(() => new Promise<void>(() => {}));
    let hasStarted = false;
    const pair = createTransferPair({
      senderEvents: {
        onReceiverStarted: () => {
          hasStarted = true;
        },
      },
      receiverOptions: { chooseStorage: storage.chooseStorage },
    });
    pair.sender.start([createTestFile(512 * 1024)]);
    await waitFor(() => hasStarted && storage.writers[0]?.write.mock.calls.length === 1);

    const cut = pair.receiver.interrupt();

    expect(cut?.resume?.nextChunk).toBe(1);
    // A second call, or the connection closing afterwards, changes nothing
    expect(pair.receiver.interrupt()).toBeNull();
  });

  it('has nothing to carry on when the connection drops outside a download', () => {
    const senderConn = new MockDataConnection();
    const sender = new TransferSender(asConnection(senderConn), {});
    sender.start([createTestFile(10 * 1024)]);

    expect(sender.interrupt()).toBeNull();
  });
});

describe('resume requests', () => {
  function senderWith(files: TransferFile[], events: SenderEvents = {}) {
    const conn = new MockDataConnection();
    const errors: string[] = [];
    const sender = new TransferSender(asConnection(conn), {
      ...events,
      onError: (message) => {
        errors.push(message);
      },
    });
    sender.start(files);
    const request = async (payload: { fileIndex: number; fromChunk?: number }) => {
      conn.emit('data', JSON.stringify({ type: 'FILE_START', payload }));
      await sleep(10);
    };
    return { conn, errors, request };
  }

  it('sends only the rest of a file, with the checksum of all of it', async () => {
    const file = createTestFile(300 * 1024);
    const { conn, errors, request } = senderWith([file]);

    await request({ fileIndex: 0, fromChunk: 2 });
    await waitFor(() => conn.sentMessageTypes().includes('FILE_COMPLETE'));

    expect(errors).toEqual([]);
    expect(conn.sentChunkCount()).toBe(3);
    const complete = conn.sent
      .filter((data): data is string => typeof data === 'string')
      .map((data) => JSON.parse(data))
      .find((message) => message.type === 'FILE_COMPLETE');
    const whole = new FastStreamingChecksum();
    whole.update(new Uint8Array(await file.rawFile.arrayBuffer()));
    expect(complete.payload.checksum).toBe(whole.digest());
  });

  it('tells the room how much of the download had already arrived', async () => {
    let started: [number[], number | undefined] | null = null;
    const { request } = senderWith([createTestFile(300 * 1024)], {
      onReceiverStarted: (fileIndices, startBytes) => {
        started = [fileIndices, startBytes];
      },
    });

    await request({ fileIndex: 0, fromChunk: 2 });

    expect(started).toEqual([[0], 2 * 64 * 1024]);
  });

  it('refuses to carry on past the end of a file', async () => {
    const { errors, request } = senderWith([createTestFile(100 * 1024)]);

    await request({ fileIndex: 0, fromChunk: 3 });

    expect(errors).toHaveLength(1);
  });

  it('refuses to carry on a file other than the first of a download', async () => {
    const { errors, request } = senderWith([createTestFile(100 * 1024, 'a.bin'), createTestFile(100 * 1024, 'b.bin')]);

    await request({ fileIndex: 0 });
    await request({ fileIndex: 1, fromChunk: 1 });

    expect(errors).toHaveLength(1);
  });
});

describe('resuming after a dropped connection', () => {
  function joined(chunks: Uint8Array[]): Uint8Array {
    const whole = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      whole.set(chunk, offset);
      offset += chunk.length;
    }
    return whole;
  }

  /** Downloads `files` until `chunksBeforeCut` chunks are written, then drops the connection mid-write. */
  async function downloadUntilCut(files: TransferFile[], chunksBeforeCut: number) {
    const saved: Uint8Array[] = [];
    let resume: ResumePoint | null = null;
    let writes = 0;
    const cut = () => {
      for (const conn of [pair.senderConn, pair.receiverConn]) {
        conn.otherEnd = null;
        conn.open = false;
      }
      pair.senderConn.emit('close');
      pair.receiverConn.emit('close');
    };
    const pair = createTransferPair({
      receiverEvents: {
        onConnectionLost: (interruption) => {
          resume = interruption.resume;
        },
      },
      receiverOptions: {
        chooseStorage: fakeStorage(async (chunk) => {
          saved.push(chunk.slice());
          if (++writes === chunksBeforeCut) {
            cut();
          }
        }).chooseStorage,
      },
    });
    pair.sender.start(files);
    await waitFor(() => resume !== null);
    return { saved, resume: resume as unknown as ResumePoint };
  }

  /** A new connection whose receiver carries on from `resume`; it must never ask where to save. */
  function resumeWith(files: TransferFile[], resume: ResumePoint) {
    const seen = { resumed: null as number[] | null, failures: 0, firstMetrics: null as TransferMetrics | null };
    const pair = createTransferPair({
      isAutoReceiving: false,
      receiverEvents: {
        onResumed: (fileIndices) => {
          seen.resumed = fileIndices;
        },
        onResumeFailed: () => {
          seen.failures++;
        },
        onMetrics: (metrics) => {
          seen.firstMetrics ??= metrics;
        },
      },
      receiverOptions: {
        resumeFrom: resume,
        chooseStorage: async () => {
          throw new Error('Must not ask where to save');
        },
      },
    });
    pair.sender.start(files);
    return { pair, seen };
  }

  it('carries on from the last saved chunk on a new connection, without asking where to save', async () => {
    const file = createTestFile(300 * 1024);
    const { saved, resume } = await downloadUntilCut([file], 2);
    expect(resume).toMatchObject({ fileId: file.id, nextChunk: 2, receivedBytes: 2 * 64 * 1024 });

    const { pair, seen } = resumeWith([file], resume);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(seen.resumed).toEqual([0]);
    expect(pair.record.receiverResult).toEqual({ corruptedFiles: [] });
    expect(joined(saved)).toEqual(new Uint8Array(await file.rawFile.arrayBuffer()));
    // Only the rest went over the new connection, and progress picked up where it stopped
    expect(pair.senderConn.sentChunkCount()).toBe(3);
    expect(seen.firstMetrics!.bytesTransferred).toBeGreaterThanOrEqual(2 * 64 * 1024);
  });

  it('finishes a file whose last chunk arrived just before the cut', async () => {
    const file = createTestFile(300 * 1024);
    const { saved, resume } = await downloadUntilCut([file], 5);
    expect(resume.nextChunk).toBe(5);

    const { pair } = resumeWith([file], resume);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(pair.senderConn.sentChunkCount()).toBe(0);
    expect(pair.record.receiverResult).toEqual({ corruptedFiles: [] });
    expect(joined(saved)).toEqual(new Uint8Array(await file.rawFile.arrayBuffer()));
  });

  it('carries on with the rest of the download after the cut-off file, skipping files no longer offered', async () => {
    const a = createTestFile(300 * 1024, 'a.bin');
    const b = createTestFile(10 * 1024, 'b.bin');
    const c = createTestFile(10 * 1024, 'c.bin');
    const { resume } = await downloadUntilCut([a, b, c], 2);
    expect(resume.remainingIds).toEqual(['a.bin', 'b.bin', 'c.bin']);

    const { pair, seen } = resumeWith([a, c], resume);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(seen.resumed).toEqual([0, 1]);
  });

  it.each([
    ['is no longer offered', createTestFile(300 * 1024, 'other.bin')],
    ['changed size', createTestFile(200 * 1024, 'a.bin')],
  ])('lets go of the half-written file when it %s', async (_, replacement) => {
    const { resume } = await downloadUntilCut([createTestFile(300 * 1024, 'a.bin')], 2);

    const { pair, seen } = resumeWith([replacement], resume);

    expect(await waitFor(() => seen.failures === 1)).toBe(true);
    expect(resume.writer.abort).toHaveBeenCalled();
    expect(pair.senderConn.sentChunkCount()).toBe(0);
    expect(pair.record.receiverErrors).toEqual([]);
  });

  it('lets go of the half-written file when the sender reordered its list', async () => {
    const a = createTestFile(300 * 1024, 'a.bin');
    const b = createTestFile(10 * 1024, 'b.bin');
    const { resume } = await downloadUntilCut([a, b], 2);

    const { seen } = resumeWith([b, a], resume);

    expect(await waitFor(() => seen.failures === 1)).toBe(true);
  });

  it('never builds a resume point for a writer whose save picker has not finished', async () => {
    const a = createTestFile(10 * 1024, 'a.bin');
    const b = createTestFile(10 * 1024, 'b.bin');
    let fileCalls = 0;
    let interruption: DownloadInterruption | null = null;
    const pair = createTransferPair({
      receiverEvents: {
        onConnectionLost: (received) => {
          interruption = received;
        },
      },
      receiverOptions: {
        chooseStorage: async () => () => {
          fileCalls++;
          if (fileCalls === 1) {
            return createFakeWriter();
          }
          return { ...createFakeWriter(), prepare: vi.fn(() => new Promise<boolean>(() => {})) };
        },
      },
    });

    pair.sender.start([a, b]);
    await waitFor(() => fileCalls === 2);
    for (const conn of [pair.senderConn, pair.receiverConn]) {
      conn.otherEnd = null;
      conn.open = false;
    }
    pair.senderConn.emit('close');
    pair.receiverConn.emit('close');

    expect(await waitFor(() => interruption !== null)).toBe(true);
    expect(interruption).toMatchObject({ resume: null, finishedCount: 1 });
  });

  it('closes the next file opened after the receiver stopped, and never asks for it', async () => {
    const a = createTestFile(10 * 1024, 'a.bin');
    const b = createTestFile(10 * 1024, 'b.bin');
    let finishPrepare: (isPrepared: boolean) => void = () => {};
    let isPrepared = false;
    let hasAbortedAfterPrepare = false;
    const lateWriter = {
      ...createFakeWriter(),
      prepare: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finishPrepare = resolve;
          })
      ),
      abort: vi.fn(async () => {
        hasAbortedAfterPrepare ||= isPrepared;
      }),
    };
    const pair = createTransferPair({
      receiverOptions: {
        chooseStorage: async () => (file) => (file.name === 'a.bin' ? createFakeWriter() : lateWriter),
      },
    });

    pair.sender.start([a, b]);
    await waitFor(() => lateWriter.prepare.mock.calls.length === 1);
    pair.receiver.cancel();
    isPrepared = true;
    finishPrepare(true);
    await sleep(20);

    expect(hasAbortedAfterPrepare).toBe(true);
    expect(pair.receiverConn.sentMessageTypes().filter((type) => type === 'FILE_START')).toHaveLength(1);
  });
});

describe('storage and read failures', () => {
  it('writes received chunks to disk one at a time', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const storage = fakeStorage(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(5);
      inFlight--;
    });
    const pair = createTransferPair({ receiverOptions: { chooseStorage: storage.chooseStorage } });

    pair.sender.start([createTestFile(64 * 1024 * 4)]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(maxInFlight).toBe(1);
  });

  it('reports a disk write failure on both sides and never completes', async () => {
    const storage = fakeStorage(() => Promise.reject(new Error('Disk full')));
    const pair = createTransferPair({ receiverOptions: { chooseStorage: storage.chooseStorage } });

    pair.sender.start([createTestFile(64 * 1024 * 3)]);

    expect(await waitFor(() => pair.record.receiverErrors.length > 0 && pair.record.senderErrors.length > 0)).toBe(true);
    // Let any in-flight FILE_COMPLETE arrive; it must not complete the failed transfer
    await sleep(30);
    expect(pair.record.receiverErrors).toEqual(['Disk full']);
    expect(pair.record.senderErrors).toEqual(['Disk full']);
    expect(pair.record.receiverResult).toBeNull();
  });

  it('reports a storage preparation failure on both sides', async () => {
    const writer = createFakeWriter();
    writer.prepare = vi.fn().mockRejectedValue(new Error('Permission revoked'));
    const pair = createTransferPair({ receiverOptions: { chooseStorage: async () => () => writer } });

    pair.sender.start([createTestFile(1024, 'a.bin'), createTestFile(1024, 'b.bin')]);

    expect(await waitFor(() => pair.record.receiverErrors.length > 0 && pair.record.senderErrors.length > 0)).toBe(true);
    expect(pair.record.receiverErrors).toHaveLength(1);
    expect(pair.record.senderErrors).toHaveLength(1);
  });

  it('reports an unreadable source file on both sides, naming the file and what to do', async () => {
    const pair = createTransferPair();
    const unreadable = createTestFile(10 * 1024);
    unreadable.rawFile = {
      size: unreadable.size,
      slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('The requested file could not be read', 'NotReadableError')) }),
    } as unknown as File;

    pair.sender.start([unreadable]);

    expect(await waitFor(() => pair.record.receiverErrors.length > 0 && pair.record.senderErrors.length > 0)).toBe(true);
    expect(pair.record.senderErrors).toHaveLength(1);
    expect(pair.record.senderErrors[0]).toMatch(/test-video\.mp4.*add it again/i);
  });
});

describe('progress reporting', () => {
  it('throttles metrics updates but always reports each file reaching 100%', async () => {
    const receiverMetrics: TransferMetrics[] = [];
    const pair = createTransferPair({
      receiverEvents: {
        onMetrics: (metrics) => {
          receiverMetrics.push(metrics);
        },
      },
    });
    const chunkCount = 40;

    pair.sender.start([createTestFile(64 * 1024 * chunkCount)]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(receiverMetrics.length).toBeLessThan(chunkCount / 2);
    expect(receiverMetrics[receiverMetrics.length - 1].currentFilePercent).toBe(100);
  });
});

describe('receiver input validation', () => {
  it('rejects a chunk for a file other than the one being received, without writing it', async () => {
    const { emit, errors, storage } = await startReceiverWithFakeSender([4, 4]);

    await emit(encodeChunk(1, 0, new Uint8Array([1, 2, 3, 4])));

    expect(errors).toHaveLength(1);
    expect(storage.writers[0].write).not.toHaveBeenCalled();
  });

  it('rejects data beyond the declared file size', async () => {
    const { emit, errors, storage } = await startReceiverWithFakeSender([4]);

    await emit(encodeChunk(0, 0, new Uint8Array(8)));

    expect(errors).toHaveLength(1);
    expect(storage.writers[0].write).not.toHaveBeenCalled();
  });

  it('rejects chunks that arrive out of order', async () => {
    const { emit, errors, storage } = await startReceiverWithFakeSender([200 * 1024]);

    await emit(encodeChunk(0, 1, new Uint8Array(1024)));

    expect(errors).toHaveLength(1);
    expect(storage.writers[0].write).not.toHaveBeenCalled();
  });

  it('accepts in-order chunks within the declared size and completes on a matching checksum', async () => {
    let result: TransferResult | null = null;
    const { emit, errors, storage } = await startReceiverWithFakeSender([6], {
      onAllCompleted: (completed) => {
        result = completed;
      },
    });
    const checksum = new FastStreamingChecksum();
    checksum.update(new Uint8Array([1, 2, 3, 4, 5, 6]));

    await emit(encodeChunk(0, 0, new Uint8Array([1, 2, 3])));
    await emit(encodeChunk(0, 1, new Uint8Array([4, 5, 6])));
    await emit(JSON.stringify({ type: 'FILE_COMPLETE', payload: { fileIndex: 0, checksum: checksum.digest() } }));

    expect(errors).toEqual([]);
    expect(storage.writers[0].write).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ corruptedFiles: [] });
  });

  it('fails on a malformed control message instead of ignoring it', async () => {
    const { emit, errors } = await startReceiverWithFakeSender([4]);

    await emit(JSON.stringify({ type: 'FILE_COMPLETE', payload: { fileIndex: 'zero' } }));

    expect(errors).toHaveLength(1);
  });

  it('rejects file data that arrives before any file was requested', async () => {
    const receiverConn = new MockDataConnection();
    const errors: string[] = [];
    new TransferReceiver(asConnection(receiverConn), {
      onError: (message) => {
        errors.push(message);
      },
    });

    receiverConn.emit('data', encodeChunk(0, 0, new Uint8Array(4)));
    await sleep(10);

    expect(errors).toHaveLength(1);
  });
});

describe('multi-file receive into a chosen folder', () => {
  afterEach(() => {
    clearFilePickers();
  });

  it('streams every file into the folder chosen once, without further save dialogs', async () => {
    const { root, createdFiles, writables } = createMockDirectoryTree();
    (window as any).showDirectoryPicker = vi.fn().mockResolvedValue(root);
    // Browsers reject pickers opened without a user gesture; later files must never ask again
    (window as any).showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Must be handling a user gesture'), { name: 'SecurityError' }));
    const pair = createTransferPair({ receiverOptions: {} });

    pair.sender.start([
      createTestFile(100 * 1024, 'a.bin', 'album/a.bin'),
      createTestFile(70 * 1024, 'b.bin', 'album/raw/b.bin'),
    ]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect((window as any).showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect((window as any).showSaveFilePicker).not.toHaveBeenCalled();
    expect(createdFiles).toEqual(['album/a.bin', 'album/raw/b.bin']);
    const bytesWritten = (path: string) =>
      writables[path].write.mock.calls.reduce((sum: number, call: unknown[]) => sum + (call[0] as Uint8Array).byteLength, 0);
    expect(bytesWritten('album/a.bin')).toBe(100 * 1024);
    expect(bytesWritten('album/raw/b.bin')).toBe(70 * 1024);
  });
});

describe('session PIN', () => {
  function startPinSession(pin: string, senderEvents: SenderEvents = {}) {
    const prompts: PinPrompt[] = [];
    let manifest: TransferManifest | null = null;
    const pair = createTransferPair({
      senderEvents,
      isAutoReceiving: false,
      receiverEvents: {
        onPinRequired: (prompt) => {
          prompts.push(prompt);
        },
        onManifest: (received) => {
          manifest = received;
        },
      },
    });
    pair.sender.start([createTestFile(1024, 'secret-plans.pdf')], pin);
    return { ...pair, prompts, getManifest: () => manifest as TransferManifest | null };
  }

  it('asks the receiver for the PIN before revealing any file details', async () => {
    const session = startPinSession('1234');

    await waitFor(() => session.prompts.length > 0);
    await sleep(10);

    expect(session.prompts).toEqual([{ attemptsLeft: 3, isIncorrect: false }]);
    expect(session.getManifest()).toBeNull();
  });

  it('sends the manifest once the correct PIN is entered', async () => {
    const session = startPinSession('1234');
    await waitFor(() => session.prompts.length > 0);

    session.receiver.submitPin('1234');

    expect(await waitFor(() => session.getManifest() !== null)).toBe(true);
    expect(session.getManifest()!.files[0].name).toBe('secret-plans.pdf');
  });

  it('asks again with fewer attempts after a wrong PIN', async () => {
    const session = startPinSession('1234');
    await waitFor(() => session.prompts.length > 0);

    session.receiver.submitPin('0000');

    expect(await waitFor(() => session.prompts.length === 2)).toBe(true);
    expect(session.prompts[1]).toEqual({ attemptsLeft: 2, isIncorrect: true });
    expect(session.getManifest()).toBeNull();
  });

  it('ends the transfer on both sides after too many wrong PINs', async () => {
    const session = startPinSession('1234');

    for (let attempt = 1; attempt <= 3; attempt++) {
      await waitFor(() => session.prompts.length === attempt);
      session.receiver.submitPin('0000');
    }

    expect(
      await waitFor(() => session.record.receiverErrors.length > 0 && session.record.senderErrors.length > 0)
    ).toBe(true);
    expect(session.getManifest()).toBeNull();
    expect(session.prompts).toHaveLength(3);
  });

  it('tells the sender when a receiver is locked out, so the room can be closed to guessing', async () => {
    let lockouts = 0;
    const session = startPinSession('1234', {
      onPinLockout: () => {
        lockouts++;
      },
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      await waitFor(() => session.prompts.length === attempt);
      session.receiver.submitPin('0000');
    }

    expect(await waitFor(() => lockouts === 1)).toBe(true);
  });

  it('refuses to stream files to a receiver that skipped the PIN', async () => {
    const session = startPinSession('1234');

    // A modified client asks for the file without authenticating
    session.receiverConn.send(JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 0 } }));
    await sleep(20);

    expect(session.senderConn.sentChunkCount()).toBe(0);
    expect(session.record.senderErrors).toHaveLength(1);
  });
});

describe('integrity verification', () => {
  /** Flips the first payload byte of the first binary chunk only. */
  function corruptFirstChunk() {
    let hasCorrupted = false;
    return (data: unknown) => {
      if (hasCorrupted || !(data instanceof ArrayBuffer)) {
        return data;
      }
      hasCorrupted = true;
      const copy = new Uint8Array(data.slice(0));
      copy[CHUNK_HEADER_SIZE] ^= 0xff;
      return copy.buffer;
    };
  }

  it('reports corrupted files to both sides when a checksum does not match', async () => {
    const pair = createTransferPair();
    pair.senderConn.tamper = corruptFirstChunk();

    pair.sender.start([createTestFile(70 * 1024, 'a.bin', 'album/a.bin'), createTestFile(70 * 1024, 'b.bin')]);

    expect(await waitFor(pair.isComplete)).toBe(true);
    expect(pair.record.receiverResult).toEqual({ corruptedFiles: ['album/a.bin'] });
    expect(pair.record.senderResult).toEqual({ corruptedFiles: ['album/a.bin'] });
  });
});

describe('cancellation', () => {
  it('notifies the sender when the receiver cancels', async () => {
    let isSenderCancelled = false;
    const pair = createTransferPair({
      senderEvents: {
        onCancelled: () => {
          isSenderCancelled = true;
        },
      },
    });

    pair.receiver.cancel();

    expect(await waitFor(() => isSenderCancelled, 500)).toBe(true);
  });

  it('does not echo a cancel back to the peer that sent it', async () => {
    const pair = createTransferPair();

    pair.receiver.cancel();
    await sleep(30);

    const cancelsSentBy = (conn: MockDataConnection) =>
      conn.sentMessageTypes().filter((type) => type === 'TRANSFER_CANCEL').length;
    expect(cancelsSentBy(pair.receiverConn)).toBe(1);
    expect(cancelsSentBy(pair.senderConn)).toBe(0);
  });
});
