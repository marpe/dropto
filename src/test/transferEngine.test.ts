import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransferEngine } from '../services/transferEngine';
import type { TransferFile } from '../types/transfer';
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

  public on(event: string, callback: (data: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  public send(data: any) {
    if (this.otherEnd) {
      setTimeout(() => {
        this.otherEnd?.emit('data', data);
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
      onFileStart: async () => {
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
    await senderEngine.startSenderTransfer(filesToSend, false);

    await waitFor(() => transferCompleted);

    expect(manifestReceived).toBe(true);
    expect(transferCompleted).toBe(true);
    expect(verifiedResult).toBe(true);
  });

  it('notifies the sender once the receiver has verified the last file', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    receiverEngine.init(receiverConn as any, false, {
      onFileStart: () => {
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

    await senderEngine.startSenderTransfer([createTestFile(150 * 1024)], false);

    expect(await waitFor(() => senderCompleted)).toBe(true);
    expect(senderFileResults).toEqual([[0, true]]);
  });

  it('completes the sender only after the last of several files is acknowledged', async () => {
    const { senderConn, receiverConn } = createConnectedPair();
    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    receiverEngine.init(receiverConn as any, false, {
      onFileStart: () => {
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
      [createTestFile(100 * 1024, 'a.bin'), createTestFile(70 * 1024, 'b.bin')],
      false
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

    await senderEngine.startSenderTransfer([createTestFile(10 * 1024)], false);
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
      onFileStart: () => {
        manifestReceived = true;
      },
      onError: (err) => {
        errors.push(err);
      },
    });
    senderEngine.init(senderConn as any, true, {});

    await senderEngine.startSenderTransfer([createTestFile(10 * 1024)], false);
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
      onFileStart: () => {
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

    await senderEngine.startSenderTransfer([createTestFile(10 * 1024)], false);
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

    await engine.startSenderTransfer([createTestFile(10 * 1024)], false);
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
      onFileStart: () => {
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

    await senderEngine.startSenderTransfer([createTestFile(64 * 1024 * 4)], false);

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

    await senderEngine.startSenderTransfer([createTestFile(64 * 1024 * 3)], false);

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
      onFileStart: () => {
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

    await senderEngine.startSenderTransfer([createTestFile(1024, 'a.bin'), createTestFile(1024, 'b.bin')], false);

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

    await senderEngine.startSenderTransfer([unreadable], false);

    expect(await waitFor(() => receiverErrors.length > 0 && senderErrors.length > 0, 1000)).toBe(true);
    expect(receiverErrors).toHaveLength(1);
    expect(senderErrors).toHaveLength(1);
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
      onFileStart: () => {
        receiverEngine.startReceiving();
      },
      onAllCompleted: () => {
        receiverCompleted = true;
      },
    });
    senderEngine.init(senderConn as any, true, {});

    const first = { ...createTestFile(100 * 1024, 'a.bin'), relativePath: 'album/a.bin' };
    const second = { ...createTestFile(70 * 1024, 'b.bin'), relativePath: 'album/raw/b.bin' };
    await senderEngine.startSenderTransfer([first, second], false);

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
