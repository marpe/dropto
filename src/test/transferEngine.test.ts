import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransferEngine } from '../services/transferEngine';
import type { EngineEventCallback, PinPrompt, TransferResult } from '../services/transferEngine';
import { FastStreamingChecksum } from '../services/checksum';
import type { TransferFile, TransferManifest, TransferMetrics } from '../types/transfer';
import { clearFilePickers, createMockDirectoryTree } from './utils/mockFileSystem';

class MockDataConnection {
  public open = true;
  public dataChannel = {
    binaryType: 'arraybuffer',
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 256 * 1024,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  private listeners: Record<string, ((data: any) => void)[]> = {};
  public otherEnd: MockDataConnection | null = null;
  /** Optional hook to corrupt data in flight */
  public tamper: ((data: any) => any) | null = null;

  public on(event: string, callback: (data: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  public send(data: any) {
    const delivered = this.tamper ? this.tamper(data) : data;
    if (this.otherEnd) {
      setTimeout(() => {
        this.otherEnd?.emit('data', delivered);
      }, 0);
    }
  }

  public emit(event: string, data: any) {
    const list = this.listeners[event] || [];
    for (const cb of list) {
      cb(data);
    }
  }
}

function createConnectedPair() {
  const senderConn = new MockDataConnection();
  const receiverConn = new MockDataConnection();
  senderConn.otherEnd = receiverConn;
  receiverConn.otherEnd = senderConn;
  return { senderConn, receiverConn };
}

function createTestFile(sizeBytes: number, name = 'test-video.mp4'): TransferFile {
  const fileBytes = new Uint8Array(sizeBytes);
  for (let i = 0; i < fileBytes.length; i++) {
    fileBytes[i] = (i * 17) & 0xff;
  }
  const rawFile = new File([fileBytes], name, { type: 'video/mp4' });
  return {
    id: name,
    name,
    size: rawFile.size,
    type: rawFile.type,
    rawFile,
    chunkSize: 64 * 1024,
    totalChunks: Math.ceil(rawFile.size / (64 * 1024)),
    status: 'pending',
    bytesTransferred: 0,
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  return condition();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeChunk(fileIndex: number, chunkIndex: number, payload: Uint8Array): ArrayBuffer {
  const packet = new Uint8Array(16 + payload.length);
  const view = new DataView(packet.buffer);
  view.setUint32(0, fileIndex, false);
  view.setBigUint64(4, BigInt(chunkIndex), false);
  view.setUint32(12, payload.length, false);
  packet.set(payload, 16);
  return packet.buffer;
}

/** Receiver wired to a scripted fake sender that emits raw protocol data. Installs a save-file picker mock. */
async function startReceiverWithFakeSender(fileSizes: number[], callbacks: EngineEventCallback = {}) {
  const write = vi.fn().mockResolvedValue(undefined);
  (window as any).showSaveFilePicker = vi.fn().mockResolvedValue({
    createWritable: vi.fn().mockResolvedValue({ write, close: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) }),
  });
  const receiverConn = new MockDataConnection();
  const engine = new TransferEngine();
  const errors: string[] = [];
  engine.init(receiverConn as any, false, {
    ...callbacks,
    onError: (err) => {
      errors.push(err);
      callbacks.onError?.(err);
    },
  });
  const manifest = {
    sessionId: 's',
    totalBytes: fileSizes.reduce((a, b) => a + b, 0),
    files: fileSizes.map((size, i) => ({
      id: `f${i}`,
      name: `f${i}.bin`,
      size,
      type: 'application/octet-stream',
      chunkSize: 64 * 1024,
      totalChunks: 1,
    })),
  };
  receiverConn.emit('data', JSON.stringify({ type: 'MANIFEST', payload: manifest }));
  await sleep(20);
  await engine.prepareAndStartReceiverFile(0);
  const emit = async (data: ArrayBuffer | string) => {
    receiverConn.emit('data', data);
    await sleep(20);
  };
  return { emit, write, errors };
}

function countSentMessages(conn: MockDataConnection, type: string): number {
  return (conn.send as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([data]) => typeof data === 'string' && JSON.parse(data).type === type
  ).length;
}

describe('TransferEngine Full Protocol Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('completes full transfer from sender to receiver with checksum verification', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    // 150KB spans 3 x 64KB chunks
    const filesToSend = [createTestFile(150 * 1024)];

    let manifestReceived = false;
    let transferCompleted = false;
    let verifiedResult: boolean | null = null;

    // Init Receiver
    receiverEngine.init(receiverConn as any, false, {
      onManifest: async () => {
        manifestReceived = true;
        // Simulates clicking "Select save location & start download"
        const started = await receiverEngine.prepareAndStartReceiverFile(0);
        expect(started).toBe(true);
      },
      onFileComplete: (_idx, verified) => {
        verifiedResult = verified;
      },
      onAllCompleted: () => {
        transferCompleted = true;
      },
    });

    // Init Sender
    senderEngine.init(senderConn as any, true, {
      onFileComplete: () => {},
    });

    // Start Sender transfer
    await senderEngine.startSenderTransfer(filesToSend);

    await waitFor(() => transferCompleted);

    expect(manifestReceived).toBe(true);
    expect(transferCompleted).toBe(true);
    expect(verifiedResult).toBe(true);
  });

  it('announces the incoming manifest to the receiver', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    let received: TransferManifest | null = null;
    receiverEngine.init(receiverConn as any, false, {
      onManifest: (manifest) => {
        received = manifest;
      },
    });
    senderEngine.init(senderConn as any, true, {});

    await senderEngine.startSenderTransfer(
      [createTestFile(1024, 'a.bin'), { ...createTestFile(2048, 'b.bin'), relativePath: 'dir/b.bin' }]
    );

    expect(await waitFor(() => received !== null)).toBe(true);
    expect(received!.totalBytes).toBe(3072);
    expect(received!.files.map((f) => [f.name, f.size, f.relativePath])).toEqual([
      ['a.bin', 1024, undefined],
      ['b.bin', 2048, 'dir/b.bin'],
    ]);
  });

  it('notifies the sender once the receiver has verified the last file', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.prepareAndStartReceiverFile(0);
      },
    });

    const senderFileResults: [number, boolean][] = [];
    let senderCompleted = false;
    senderEngine.init(senderConn as any, true, {
      onFileComplete: (idx, verified) => {
        senderFileResults.push([idx, verified]);
      },
      onAllCompleted: () => {
        senderCompleted = true;
      },
    });

    await senderEngine.startSenderTransfer([createTestFile(150 * 1024)]);

    expect(await waitFor(() => senderCompleted)).toBe(true);
    expect(senderFileResults).toEqual([[0, true]]);
  });

  it('completes the sender only after the last of several files is acknowledged', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.prepareAndStartReceiverFile(0);
      },
    });

    const senderEvents: string[] = [];
    senderEngine.init(senderConn as any, true, {
      onFileComplete: (idx) => {
        senderEvents.push(`file:${idx}`);
      },
      onAllCompleted: () => {
        senderEvents.push('all');
      },
    });

    await senderEngine.startSenderTransfer(
      [createTestFile(100 * 1024, 'a.bin'), createTestFile(70 * 1024, 'b.bin')]
    );

    expect(await waitFor(() => senderEvents.includes('all'))).toBe(true);
    expect(senderEvents).toEqual(['file:0', 'file:1', 'all']);
  });
});

describe('TransferEngine connection loss', () => {
  it('reports an error to the sender when the connection closes mid-transfer', async () => {
    const { senderConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const errors: string[] = [];
    senderEngine.init(senderConn as any, true, {
      onError: (err) => {
        errors.push(err);
      },
    });

    await senderEngine.startSenderTransfer([createTestFile(10 * 1024)]);
    senderConn.emit('close', undefined);

    expect(errors).toHaveLength(1);
  });

  it('reports an error to the receiver when the connection closes after the manifest arrives', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    let manifestReceived = false;
    const errors: string[] = [];
    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        manifestReceived = true;
      },
      onError: (err) => {
        errors.push(err);
      },
    });
    senderEngine.init(senderConn as any, true, {});

    await senderEngine.startSenderTransfer([createTestFile(10 * 1024)]);
    await waitFor(() => manifestReceived);
    receiverConn.emit('close', undefined);

    expect(errors).toHaveLength(1);
  });

  it('does not report an error when the connection closes after the transfer completed', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    const errors: string[] = [];
    let senderCompleted = false;
    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.prepareAndStartReceiverFile(0);
      },
      onError: (err) => {
        errors.push(`receiver: ${err}`);
      },
    });
    senderEngine.init(senderConn as any, true, {
      onAllCompleted: () => {
        senderCompleted = true;
      },
      onError: (err) => {
        errors.push(`sender: ${err}`);
      },
    });

    await senderEngine.startSenderTransfer([createTestFile(10 * 1024)]);
    expect(await waitFor(() => senderCompleted)).toBe(true);
    senderConn.emit('close', undefined);
    receiverConn.emit('close', undefined);

    expect(errors).toEqual([]);
  });

  it('ignores a close from a previous connection after re-initialising', async () => {
    const engine = new TransferEngine();
    const oldConn = new MockDataConnection();
    const { senderConn: newConn } = createConnectedPair();
    const errors: string[] = [];
    engine.init(oldConn as any, true, {});
    engine.init(newConn as any, true, {
      onError: (err) => {
        errors.push(err);
      },
    });

    await engine.startSenderTransfer([createTestFile(10 * 1024)]);
    oldConn.emit('close', undefined);

    expect(errors).toEqual([]);
  });
});

describe('TransferEngine storage and read failures', () => {
  afterEach(() => {
    clearFilePickers();
  });

  function useSaveFilePickerWith(writable: { write: (chunk: Uint8Array) => Promise<void> }) {
    (window as any).showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        write: writable.write,
        close: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn().mockResolvedValue(undefined),
      }),
    });
  }

  function startPair(receiverErrors: string[], senderErrors: string[]) {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    let receiverCompleted = false;
    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.prepareAndStartReceiverFile(0);
      },
      onAllCompleted: () => {
        receiverCompleted = true;
      },
      onError: (err) => {
        receiverErrors.push(err);
      },
    });
    senderEngine.init(senderConn as any, true, {
      onError: (err) => {
        senderErrors.push(err);
      },
    });
    return { senderEngine, isReceiverCompleted: () => receiverCompleted };
  }

  it('writes received chunks to disk one at a time', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    useSaveFilePickerWith({
      write: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
    });
    const { senderEngine, isReceiverCompleted } = startPair([], []);

    await senderEngine.startSenderTransfer([createTestFile(64 * 1024 * 4)]);

    expect(await waitFor(isReceiverCompleted)).toBe(true);
    expect(maxInFlight).toBe(1);
  });

  it('reports a disk write failure on both sides', async () => {
    useSaveFilePickerWith({
      write: () => Promise.reject(new Error('Disk full')),
    });
    const receiverErrors: string[] = [];
    const senderErrors: string[] = [];
    const { senderEngine, isReceiverCompleted } = startPair(receiverErrors, senderErrors);

    await senderEngine.startSenderTransfer([createTestFile(64 * 1024 * 3)]);

    expect(await waitFor(() => receiverErrors.length > 0 && senderErrors.length > 0, 1000)).toBe(true);
    // Let any in-flight FILE_COMPLETE arrive; it must not complete the failed transfer
    await new Promise((r) => setTimeout(r, 50));
    expect(receiverErrors).toHaveLength(1);
    expect(senderErrors).toHaveLength(1);
    expect(isReceiverCompleted()).toBe(false);
  });

  it('reports a storage preparation failure on both sides', async () => {
    const { root } = createMockDirectoryTree();
    root.getFileHandle = vi.fn().mockRejectedValue(
      Object.assign(new Error('Permission revoked'), { name: 'NotAllowedError' })
    );
    (window as any).showDirectoryPicker = vi.fn().mockResolvedValue(root);
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    const receiverErrors: string[] = [];
    const senderErrors: string[] = [];
    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.startReceiving();
      },
      onError: (err) => {
        receiverErrors.push(err);
      },
    });
    senderEngine.init(senderConn as any, true, {
      onError: (err) => {
        senderErrors.push(err);
      },
    });

    await senderEngine.startSenderTransfer([createTestFile(1024, 'a.bin'), createTestFile(1024, 'b.bin')]);

    expect(await waitFor(() => receiverErrors.length > 0 && senderErrors.length > 0, 1000)).toBe(true);
    expect(receiverErrors).toHaveLength(1);
    expect(senderErrors).toHaveLength(1);
  });

  it('reports an unreadable source file on both sides', async () => {
    const receiverErrors: string[] = [];
    const senderErrors: string[] = [];
    const { senderEngine } = startPair(receiverErrors, senderErrors);
    const unreadable = createTestFile(10 * 1024);
    unreadable.rawFile = {
      size: unreadable.size,
      slice: () => ({ arrayBuffer: () => Promise.reject(new Error('File was modified')) }),
    } as unknown as File;

    await senderEngine.startSenderTransfer([unreadable]);

    expect(await waitFor(() => receiverErrors.length > 0 && senderErrors.length > 0, 1000)).toBe(true);
    expect(receiverErrors).toHaveLength(1);
    expect(senderErrors).toHaveLength(1);
  });
});

describe('TransferEngine progress reporting', () => {
  afterEach(() => {
    clearFilePickers();
  });

  it('throttles metrics updates but always reports each file reaching 100%', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    const receiverMetrics: TransferMetrics[] = [];
    let receiverCompleted = false;
    let senderCompleted = false;
    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.prepareAndStartReceiverFile(0);
      },
      onMetrics: (m) => {
        receiverMetrics.push(m);
      },
      onAllCompleted: () => {
        receiverCompleted = true;
      },
    });
    senderEngine.init(senderConn as any, true, {
      onAllCompleted: () => {
        senderCompleted = true;
      },
    });
    const chunkCount = 40;

    await senderEngine.startSenderTransfer([createTestFile(64 * 1024 * chunkCount)]);
    // Wait for both sides so no engine is still writing document.title when later tests run
    expect(await waitFor(() => receiverCompleted && senderCompleted)).toBe(true);

    expect(receiverMetrics.length).toBeLessThan(chunkCount / 2);
    expect(receiverMetrics[receiverMetrics.length - 1].currentFilePercent).toBe(100);
  });

  it('restores the page title once the transfer completes', async () => {
    // A single engine: two engines in one test would share and overwrite document.title
    document.title = 'DropWave';
    let completed = false;
    const { emit } = await startReceiverWithFakeSender([3], {
      onAllCompleted: () => {
        completed = true;
      },
    });
    const payload = new Uint8Array([1, 2, 3]);
    const checksum = new FastStreamingChecksum();
    checksum.update(payload);

    await emit(makeChunk(0, 0, payload));
    await emit(JSON.stringify({ type: 'FILE_COMPLETE', payload: { fileIndex: 0, checksum: checksum.digest() } }));

    expect(completed).toBe(true);
    expect(document.title).toBe('DropWave');
  });
});

describe('TransferEngine receiver input validation', () => {
  afterEach(() => {
    clearFilePickers();
  });

  it('rejects a chunk for a file other than the one being received, without writing it', async () => {
    const { emit, write, errors } = await startReceiverWithFakeSender([4, 4]);

    await emit(makeChunk(1, 0, new Uint8Array([1, 2, 3, 4])));

    expect(errors).toHaveLength(1);
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects data beyond the declared file size', async () => {
    const { emit, write, errors } = await startReceiverWithFakeSender([4]);

    await emit(makeChunk(0, 0, new Uint8Array(8)));

    expect(errors).toHaveLength(1);
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects chunks that arrive out of order', async () => {
    const { emit, write, errors } = await startReceiverWithFakeSender([200 * 1024]);

    await emit(makeChunk(0, 1, new Uint8Array(1024)));

    expect(errors).toHaveLength(1);
    expect(write).not.toHaveBeenCalled();
  });

  it('accepts in-order chunks within the declared size', async () => {
    const { emit, write, errors } = await startReceiverWithFakeSender([6]);

    await emit(makeChunk(0, 0, new Uint8Array([1, 2, 3])));
    await emit(makeChunk(0, 1, new Uint8Array([4, 5, 6])));

    expect(errors).toEqual([]);
    expect(write).toHaveBeenCalledTimes(2);
  });
});

describe('TransferEngine multi-file receive', () => {
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

    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    let receiverCompleted = false;
    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.startReceiving();
      },
      onAllCompleted: () => {
        receiverCompleted = true;
      },
    });
    senderEngine.init(senderConn as any, true, {});

    const first = { ...createTestFile(100 * 1024, 'a.bin'), relativePath: 'album/a.bin' };
    const second = { ...createTestFile(70 * 1024, 'b.bin'), relativePath: 'album/raw/b.bin' };
    await senderEngine.startSenderTransfer([first, second]);

    expect(await waitFor(() => receiverCompleted)).toBe(true);
    expect((window as any).showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect((window as any).showSaveFilePicker).not.toHaveBeenCalled();
    expect(createdFiles).toEqual(['album/a.bin', 'album/raw/b.bin']);
    const bytesWritten = (path: string) =>
      writables[path].write.mock.calls.reduce((acc: number, call: unknown[]) => acc + (call[0] as Uint8Array).byteLength, 0);
    expect(bytesWritten('album/a.bin')).toBe(100 * 1024);
    expect(bytesWritten('album/raw/b.bin')).toBe(70 * 1024);
  });
});

describe('TransferEngine session PIN', () => {
  function startPinSession(pin: string) {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    const prompts: PinPrompt[] = [];
    const receiverErrors: string[] = [];
    const senderErrors: string[] = [];
    let manifest: TransferManifest | null = null;
    receiverEngine.init(receiverConn as any, false, {
      onPinRequired: (prompt) => {
        prompts.push(prompt);
      },
      onManifest: (m) => {
        manifest = m;
      },
      onError: (err) => {
        receiverErrors.push(err);
      },
    });
    senderEngine.init(senderConn as any, true, {
      onError: (err) => {
        senderErrors.push(err);
      },
    });
    const start = () => senderEngine.startSenderTransfer([createTestFile(1024, 'secret-plans.pdf')], pin);
    return {
      senderConn,
      receiverConn,
      receiverEngine,
      prompts,
      receiverErrors,
      senderErrors,
      start,
      getManifest: () => manifest as TransferManifest | null,
    };
  }

  it('asks the receiver for the PIN before revealing any file details', async () => {
    const session = startPinSession('1234');

    await session.start();
    await waitFor(() => session.prompts.length > 0);
    await sleep(20);

    expect(session.prompts).toEqual([{ attemptsLeft: 3, incorrect: false }]);
    expect(session.getManifest()).toBeNull();
  });

  it('sends the manifest once the correct PIN is entered', async () => {
    const session = startPinSession('1234');
    await session.start();
    await waitFor(() => session.prompts.length > 0);

    session.receiverEngine.submitPin('1234');

    expect(await waitFor(() => session.getManifest() !== null)).toBe(true);
    expect(session.getManifest()!.files[0].name).toBe('secret-plans.pdf');
  });

  it('asks again with fewer attempts after a wrong PIN', async () => {
    const session = startPinSession('1234');
    await session.start();
    await waitFor(() => session.prompts.length > 0);

    session.receiverEngine.submitPin('0000');

    expect(await waitFor(() => session.prompts.length === 2)).toBe(true);
    expect(session.prompts[1]).toEqual({ attemptsLeft: 2, incorrect: true });
    expect(session.getManifest()).toBeNull();
  });

  it('ends the transfer on both sides after too many wrong PINs', async () => {
    const session = startPinSession('1234');
    await session.start();

    for (let attempt = 1; attempt <= 3; attempt++) {
      await waitFor(() => session.prompts.length === attempt);
      session.receiverEngine.submitPin('0000');
    }

    expect(await waitFor(() => session.receiverErrors.length > 0 && session.senderErrors.length > 0)).toBe(true);
    expect(session.getManifest()).toBeNull();
    expect(session.prompts).toHaveLength(3);
  });

  it('refuses to stream files to a receiver that skipped the PIN', async () => {
    const session = startPinSession('1234');
    const senderSend = vi.spyOn(session.senderConn, 'send');
    await session.start();

    // A modified client asks for the file without authenticating
    session.receiverConn.send(JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 0, resumeFromChunk: 0 } }));
    await sleep(50);

    const binarySent = senderSend.mock.calls.some(([data]) => data instanceof ArrayBuffer);
    expect(binarySent).toBe(false);
  });
});

describe('TransferEngine integrity verification', () => {
  const HEADER_SIZE = 16;

  /** Flips the first payload byte of the first binary chunk only. */
  function corruptFirstChunk() {
    let corrupted = false;
    return (data: any) => {
      if (corrupted || !(data instanceof ArrayBuffer)) {
        return data;
      }
      corrupted = true;
      const copy = new Uint8Array(data.slice(0));
      copy[HEADER_SIZE] ^= 0xff;
      return copy.buffer;
    };
  }

  async function runTransfer(files: TransferFile[], tamper: ((data: any) => any) | null) {
    const { senderConn, receiverConn } = createConnectedPair();
    senderConn.tamper = tamper;
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    let receiverResult: TransferResult | null = null;
    let senderResult: TransferResult | null = null;
    receiverEngine.init(receiverConn as any, false, {
      onManifest: () => {
        receiverEngine.prepareAndStartReceiverFile(0);
      },
      onAllCompleted: (result) => {
        receiverResult = result;
      },
    });
    senderEngine.init(senderConn as any, true, {
      onAllCompleted: (result) => {
        senderResult = result;
      },
    });

    await senderEngine.startSenderTransfer(files);
    await waitFor(() => receiverResult !== null && senderResult !== null);
    return { receiverResult, senderResult };
  }

  it('reports corrupted files to both sides when a checksum does not match', async () => {
    const files = [
      { ...createTestFile(70 * 1024, 'a.bin'), relativePath: 'album/a.bin' },
      createTestFile(70 * 1024, 'b.bin'),
    ];

    const { receiverResult, senderResult } = await runTransfer(files, corruptFirstChunk());

    expect(receiverResult).toEqual({ corruptedFiles: ['album/a.bin'] });
    expect(senderResult).toEqual({ corruptedFiles: ['album/a.bin'] });
  });

  it('reports no corrupted files when every checksum matches', async () => {
    const { receiverResult, senderResult } = await runTransfer([createTestFile(70 * 1024)], null);

    expect(receiverResult).toEqual({ corruptedFiles: [] });
    expect(senderResult).toEqual({ corruptedFiles: [] });
  });
});

describe('TransferEngine cancellation', () => {
  it('notifies the sender when the receiver cancels', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    let senderCancelled = false;
    senderEngine.init(senderConn as any, true, {
      onCancelled: () => {
        senderCancelled = true;
      },
    });
    receiverEngine.init(receiverConn as any, false, {});

    receiverEngine.cancel();

    expect(await waitFor(() => senderCancelled, 500)).toBe(true);
  });

  it('does not echo a cancel back to the peer that sent it', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    vi.spyOn(senderConn, 'send');
    vi.spyOn(receiverConn, 'send');
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();
    senderEngine.init(senderConn as any, true, {});
    receiverEngine.init(receiverConn as any, false, {});

    receiverEngine.cancel();
    await new Promise((r) => setTimeout(r, 100));

    expect(countSentMessages(receiverConn, 'TRANSFER_CANCEL')).toBe(1);
    expect(countSentMessages(senderConn, 'TRANSFER_CANCEL')).toBe(0);
  });
});
