import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferEngine } from '../services/transferEngine';
import type { TransferFile } from '../types/transfer';

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

describe('TransferEngine Full Protocol Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('completes full transfer from sender to receiver with checksum verification', async () => {
    const senderConn = new MockDataConnection();
    const receiverConn = new MockDataConnection();
    senderConn.otherEnd = receiverConn;
    receiverConn.otherEnd = senderConn;

    const senderEngine = new TransferEngine();
    const receiverEngine = new TransferEngine();

    // Create a 150KB dummy file (spans 3 x 64KB chunks)
    const fileBytes = new Uint8Array(150 * 1024);
    for (let i = 0; i < fileBytes.length; i++) {
      fileBytes[i] = (i * 17) & 0xff;
    }
    const testFile = new File([fileBytes], 'test-video.mp4', { type: 'video/mp4' });

    const filesToSend: TransferFile[] = [
      {
        id: 'file-1',
        name: testFile.name,
        size: testFile.size,
        type: testFile.type,
        rawFile: testFile,
        chunkSize: 64 * 1024,
        totalChunks: Math.ceil(testFile.size / (64 * 1024)),
        status: 'pending',
        bytesTransferred: 0,
      },
    ];

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

    // Wait for the asynchronous transfer exchange to complete
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (transferCompleted) {
          clearInterval(interval);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 5000);
    });

    expect(manifestReceived).toBe(true);
    expect(transferCompleted).toBe(true);
    expect(verifiedResult).toBe(true);
  });
});
