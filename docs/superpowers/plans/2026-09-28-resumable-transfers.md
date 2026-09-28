# Resumable Transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A download cut off by a dropped connection carries on where it stopped on the next connection, with no click and no second save dialog; when it cannot, the receiver gets the list back with the unfinished files ticked.

**Architecture:** Engines stay one per connection. When a connection drops mid-download, `TransferPeer.interrupt()` returns a `DownloadInterruption` (files finished, corrupted names, and on the receiver a `ResumePoint` holding the still-open writer and checksum). The receiver hook keeps it in a ref while reconnecting and hands it to the next `TransferReceiver` (`resumeFrom`), which, once the manifest arrives, sends `FILE_START {fileIndex, fromChunk}`. The sender stays stateless: it re-reads the prefix locally to seed the CRC and streams the rest. `SenderRoom` keeps the dropped receiver's slot reserved for 60 s per `sessionId`.

**Tech Stack:** React 19, TypeScript (strict, `erasableSyntaxOnly`), Vite, Vitest (jsdom) + Testing Library, Playwright, PeerJS.

**Spec:** `docs/superpowers/specs/2026-09-28-resumable-transfers-design.md`

## Global Constraints

- TypeScript `strict` with `erasableSyntaxOnly`: no enums, no constructor parameter properties.
- `if`/loop bodies always use braces; closing brace on its own line (oxlint `curly` is an error). `npm run lint` fails on any warning.
- Unit tests live in `src/test/` (not colocated). Run one file with `npx vitest run src/test/<file> -t "<name>"`.
- Colours only through token classes; UI primitives from `components/ui/`.
- No taglines or decorative copy. New user-facing strings are exactly: `Reconnecting…` (sender row and receiver summary), `Download was interrupted.` (receiver notice), `Connection lost` (sender row error after the reservation expires).
- Reserved slot duration: `60_000` ms (`RESERVED_SLOT_MS`).
- The engine's incoming messages stay on one serialized queue; the `FILE_START` handler must not await streaming.
- Commit after every task on `develop` (whole tree), never push. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The connection drops while a chunk write is still in flight.** Expected: no chunk is written twice or skipped, and the resumed file verifies. Pinned by Task 3's reorder of `handleChunk` and Task 5's resume test, which cuts inside the write callback.
2. **The connection drops again before the new engine gets the manifest.** Expected: the half-written file is kept for the attempt after, not leaked or lost. Pinned by Task 8, "keeps the open file through another drop before the sender answers".
3. **The receiver presses Stop while reconnecting, or the sender stops an interrupted row.** Expected: the held writer is aborted, the slot is freed and the row goes. Pinned by Task 8, "lets go of the half-written file when the user stops", and Task 7, "stops someone while they reconnect".
4. **The cut comes after the last chunk but before `FILE_COMPLETE`** (`fromChunk` equals the chunk count). Expected: the sender re-seeds the CRC, sends no data and completes, and the file verifies. Pinned by Task 5, "finishes a file whose last chunk arrived just before the cut".
5. **The sender notices a replacement connection before the old one's close event** (an unnoticed drop mid-download). Expected: it counts as a cut, the slot moves to the new connection, and device effects don't end. Pinned by Task 7, "treats a connection replaced before its drop was noticed as a cut".

---

### Task 1: `fromChunk` in `FILE_START`

**Files:**
- Modify: `src/types/transfer.ts:89`
- Modify: `src/services/transfer/protocol.ts:186-187`
- Test: `src/test/protocol.test.ts`

**Interfaces:**
- Produces: `ControlMessage` variant `{ type: 'FILE_START'; payload: { fileIndex: number; fromChunk?: number } }`. `parseControlMessage` keeps `fromChunk` when it is a non-negative integer, returns `null` when it is present but invalid, and omits the key when absent.

- [ ] **Step 1: Write the failing tests**

In `src/test/protocol.test.ts`, add to the round-trip `it.each` list (next to the existing `FILE_START` entry at line 31):

```ts
    [{ type: 'FILE_START', payload: { fileIndex: 0, fromChunk: 12 } }],
```

and add to the rejected-messages `it.each` list (next to the negative/fractional file index entries at lines 47-48):

```ts
    ['a negative resume chunk', JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 0, fromChunk: -1 } })],
    ['a fractional resume chunk', JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 0, fromChunk: 0.5 } })],
    ['a non-numeric resume chunk', JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 0, fromChunk: '3' } })],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/protocol.test.ts`
Expected: FAIL. The round-trip drops `fromChunk`, and the three invalid messages parse instead of returning `null`.

- [ ] **Step 3: Implement**

`src/types/transfer.ts` line 89:

```ts
  /** `fromChunk` carries on a file cut off by a dropped connection; only on a download's first file */
  | { type: 'FILE_START'; payload: { fileIndex: number; fromChunk?: number } }
```

`src/services/transfer/protocol.ts`, replace the `FILE_START` case:

```ts
    case 'FILE_START': {
      if (!isIndex(payload.fileIndex) || (payload.fromChunk !== undefined && !isIndex(payload.fromChunk))) {
        return null;
      }
      return payload.fromChunk === undefined
        ? { type: 'FILE_START', payload: { fileIndex: payload.fileIndex } }
        : { type: 'FILE_START', payload: { fileIndex: payload.fileIndex, fromChunk: payload.fromChunk } };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/protocol.test.ts`
Expected: PASS. The existing "drops fields it does not know about" test still expects `{ fileIndex: 1 }`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: FILE_START may carry on from a chunk"
```

---

### Task 2: Metrics that start partway

**Files:**
- Modify: `src/services/transfer/metrics.ts:17-33`
- Test: `src/test/metrics.test.ts`

**Interfaces:**
- Produces: `new TransferMetricsTracker(totalBytes, totalFiles, now = Date.now, startBytes = 0)`. `bytesTransferred` starts at `startBytes`, which is not a speed sample and does not start the clock.

- [ ] **Step 1: Write the failing test**

Append inside `describe('TransferMetricsTracker', ...)` in `src/test/metrics.test.ts`:

```ts
  it('carries on from bytes that arrived before, without counting them towards speed or time', () => {
    const clock = { nowMs: 0 };
    const tracker = new TransferMetricsTracker(10_000, 1, () => clock.nowMs, 6_000);
    clock.nowMs = 5_000;
    tracker.recordBytes(1_000);
    clock.nowMs = 6_000;
    tracker.recordBytes(1_000);

    expect(tracker.snapshot(0, 'a.bin', 80)).toMatchObject({
      bytesTransferred: 8_000,
      overallPercent: 80,
      currentSpeed: 2_000,
      averageSpeed: 2_000,
      elapsedSeconds: 1,
      etaSeconds: 1,
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/metrics.test.ts -t "carries on"`
Expected: FAIL (`bytesTransferred` is 2000).

- [ ] **Step 3: Implement**

In `src/services/transfer/metrics.ts`, change the constructor:

```ts
  constructor(totalBytes: number, totalFiles: number, now: () => number = Date.now, startBytes = 0) {
    this.totalBytes = totalBytes;
    this.totalFiles = totalFiles;
    this.now = now;
    // A download carried on after a dropped connection starts where it stopped
    this.bytesTransferred = startBytes;
  }
```

Also update `averageSpeed` in `snapshot()` so it only counts bytes since the first recorded byte. Add the field `private readonly startBytes: number;`, set `this.startBytes = startBytes;` in the constructor, and change the line to:

```ts
      averageSpeed: elapsedSeconds > 0 ? (this.bytesTransferred - this.startBytes) / elapsedSeconds : 0,
```

Note: `elapsedSeconds` runs from the first `recordBytes` (t=5000), so the test's elapsed is 1 s and the average is (8000 − 6000) / 1 = 2000.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/metrics.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: metrics can start partway through a download"
```

---

### Task 3: Engines report what a cut leaves behind

**Files:**
- Modify: `src/types/transfer.ts` (events, new `DownloadInterruption`)
- Modify: `src/services/transfer/peer.ts`
- Modify: `src/services/transfer/receiver.ts` (`ResumePoint`, `captureInterruption`, `handleChunk` order)
- Modify: `src/hooks/sessionServices.ts:17-19`
- Modify: `src/test/utils/fakeSessionServices.ts`
- Test: `src/test/transfer.test.ts` (`describe('connection loss')`)

**Interfaces:**
- Consumes: `TransferMetricsTracker(..., startBytes)` from Task 2.
- Produces:
  - `src/services/transfer/receiver.ts`:
    ```ts
    export interface ResumePoint {
      createWriter: WriterFactory;
      writer: StorageWriter;
      checksum: FastStreamingChecksum;
      fileId: string;
      fileSize: number;
      nextChunk: number;
      receivedBytes: number;
      remainingIds: string[];
    }
    ```
  - `src/types/transfer.ts`: `export interface DownloadInterruption { finishedCount: number; corruptedFiles: string[]; resume: ResumePoint | null }`. `TransferEvents.onConnectionLost?: (interruption: DownloadInterruption) => void`.
  - `TransferPeer`: `public interrupt(): DownloadInterruption | null`, `protected captureInterruption(): DownloadInterruption`, `protected beginTransfer(totalBytes, totalFiles, startBytes = 0)`.
  - `SessionSender` and `SessionReceiver` include `'interrupt'`. `FakeTransfer.interrupt = vi.fn().mockReturnValue(null)`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('connection loss', ...)` in `src/test/transfer.test.ts`, after the existing tests. Add `DownloadInterruption` to the type import from `'../types/transfer'`.

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/transfer.test.ts -t "connection loss"`
Expected: FAIL. `interrupt` does not exist, and `onConnectionLost` is called without arguments.

- [ ] **Step 3: Implement the types**

In `src/types/transfer.ts`, add at the top:

```ts
import type { ResumePoint } from '../services/transfer/receiver';
```

Add after `FinishedFile`:

```ts
/** What a download cut off by a dropped connection leaves behind. */
export interface DownloadInterruption {
  /** Files of the download finished (and acknowledged) before the cut, from its start */
  finishedCount: number;
  corruptedFiles: string[];
  /** Receiver only: the file that was being written, still open, to carry on with; null when none was */
  resume: ResumePoint | null;
}
```

Replace the `onConnectionLost` line in `TransferEvents`:

```ts
  /** The connection dropped mid-download; when provided it replaces the generic onError for that case */
  onConnectionLost?: (interruption: DownloadInterruption) => void;
```

- [ ] **Step 4: Implement `TransferPeer`**

In `src/services/transfer/peer.ts`, update the imports with `DownloadInterruption`. Add the field `private finishedCount = 0;`. Then:

```ts
  protected beginTransfer(totalBytes: number, totalFiles: number, startBytes = 0) {
    this.isActive = true;
    this.corruptedFiles = [];
    this.finishedCount = 0;
    this.metrics = new TransferMetricsTracker(totalBytes, totalFiles, Date.now, startBytes);
  }

  protected recordVerification(file: NamedFile | undefined, isVerified: boolean) {
    this.finishedCount++;
    if (!isVerified && file) {
      this.corruptedFiles.push(displayPath(file));
    }
  }

  /** What a download cut off now leaves behind; the receiver adds the file it was writing. */
  protected captureInterruption(): DownloadInterruption {
    return { finishedCount: this.finishedCount, corruptedFiles: [...this.corruptedFiles], resume: null };
  }

  /**
   * Ends this engine because its connection is gone or being replaced. Mid-download it returns what was
   * finished and, on the receiver, the open file to carry on with; outside a download (or once stopped), null.
   */
  public interrupt(): DownloadInterruption | null {
    if (this.isStopped) {
      return null;
    }
    const interruption = this.isActive ? this.captureInterruption() : null;
    this.stop();
    return interruption;
  }
```

Replace `handleConnectionLost`:

```ts
  private handleConnectionLost() {
    if (this.isStopped) {
      return;
    }
    const interruption = this.interrupt();
    if (!interruption) {
      this.events.onPeerLeft?.();
      return;
    }
    if (this.events.onConnectionLost) {
      this.events.onConnectionLost(interruption);
    } else {
      this.events.onError?.('Connection to peer lost');
    }
  }
```

- [ ] **Step 5: Implement the receiver side**

In `src/services/transfer/receiver.ts`, add `DownloadInterruption` to the type import and export `ResumePoint`:

```ts
/** A file cut off by a dropped connection, still open, for the next connection's receiver to carry on with. */
export interface ResumePoint {
  createWriter: WriterFactory;
  writer: StorageWriter;
  /** Covers bytes 0..receivedBytes */
  checksum: FastStreamingChecksum;
  fileId: string;
  fileSize: number;
  nextChunk: number;
  receivedBytes: number;
  /** The cut-off file first, then the rest of the download not finished yet */
  remainingIds: string[];
}
```

Reorder `handleChunk` so the state is complete before the write is awaited. A cut during the write then always sees consistent counts, and the write already queued on the stream still lands:

```ts
    this.checksum.update(payload);
    this.expectedChunkIndex++;
    this.receivedBytesForFile += payload.length;
    // Counted before the write finishes: a cut meanwhile keeps the stream open and this write lands on it
    const writing = this.writer.writeChunk(payload);

    const position = this.selection.indexOf(fileIndex);
    this.metrics?.recordBytes(payload.length, position);
    this.emitMetrics(this.metrics?.snapshot(position, file.name, (this.receivedBytesForFile / file.size) * 100));
    await writing;
```

Add the override (after `onDownloadFinished`):

```ts
  protected captureInterruption(): DownloadInterruption {
    const interruption = super.captureInterruption();
    const manifest = this.manifest;
    const file = manifest?.files[this.fileIndex];
    if (!manifest || !file || !this.writer || !this.createWriter) {
      return interruption;
    }
    const position = this.selection.indexOf(this.fileIndex);
    const resume: ResumePoint = {
      createWriter: this.createWriter,
      writer: this.writer,
      checksum: this.checksum,
      fileId: file.id,
      fileSize: file.size,
      nextChunk: this.expectedChunkIndex,
      receivedBytes: this.receivedBytesForFile,
      remainingIds: this.selection.slice(position).map((index) => manifest.files[index].id),
    };
    // Handed over open: stopping must not abort it
    this.writer = null;
    return { ...interruption, resume };
  }
```

- [ ] **Step 6: Expose `interrupt` to the session hooks**

In `src/hooks/sessionServices.ts`:

```ts
export type SessionSender = Pick<TransferSender, 'start' | 'updateFiles' | 'holdUntil' | 'togglePause' | 'cancel' | 'interrupt'>;

export type SessionReceiver = Pick<TransferReceiver, 'startReceiving' | 'submitPin' | 'togglePause' | 'cancel' | 'interrupt'>;
```

In `src/test/utils/fakeSessionServices.ts`, add to `FakeTransfer`:

```ts
  public interrupt = vi.fn().mockReturnValue(null);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/test/transfer.test.ts`
Expected: PASS (all). The existing "reports a dropped connection separately" test still passes because its handler ignores the argument.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: engines report what a dropped connection leaves behind"
```

---

### Task 4: The sender carries on from a chunk

**Files:**
- Modify: `src/services/transfer/sender.ts`
- Modify: `src/types/transfer.ts` (`SenderEvents.onReceiverStarted`)
- Test: `src/test/transfer.test.ts` (new `describe('resume requests')`)

**Interfaces:**
- Consumes: `FILE_START.fromChunk` (Task 1) and `beginTransfer(..., startBytes)` (Task 3).
- Produces: `SenderEvents.onReceiverStarted?: (fileIndices: number[], startBytes?: number) => void`. `startBytes` is the bytes of the first file already delivered before a cut, absent for a fresh download.

- [ ] **Step 1: Write the failing tests**

Add a new block after `describe('connection loss', ...)` in `src/test/transfer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/transfer.test.ts -t "resume requests"`
Expected: FAIL. All 5 chunks are sent, and nothing is refused.

- [ ] **Step 3: Implement**

`src/types/transfer.ts`, in `SenderEvents`:

```ts
  /**
   * The receiver chose a destination and requested the first file of a download; the file list is fixed until it
   * ends. `startBytes`: how much of that first file arrived before a dropped connection, when carrying on
   */
  onReceiverStarted?: (fileIndices: number[], startBytes?: number) => void;
```

`src/services/transfer/sender.ts`: replace the `FILE_START` case:

```ts
      case 'FILE_START': {
        const { fileIndex, fromChunk = 0 } = message.payload;
        if (!this.hasSentManifest) {
          throw new Error('Receiver requested files before authenticating');
        }
        if (!this.transferIndices().includes(fileIndex)) {
          throw new Error('Receiver requested a file it did not select');
        }
        // Carrying on is only for the file a dropped connection cut off, at the start of the next download
        if (fromChunk > 0 && (this.hasReceiverStarted || fromChunk > chunkCount(this.files[fileIndex]))) {
          throw new Error('Receiver asked to carry on from an unexpected point');
        }
        const startBytes = Math.min(fromChunk * CHUNK_SIZE, this.files[fileIndex].size);
        if (!this.hasReceiverStarted) {
          this.hasReceiverStarted = true;
          const selected = this.transferIndices().map((index) => this.files[index]);
          this.beginTransfer(toManifest(selected).totalBytes, selected.length, startBytes);
          this.events.onReceiverStarted?.(this.transferIndices(), fromChunk > 0 ? startBytes : undefined);
        }
        // Not awaited: streaming a file (or waiting for a slot) must not block pause/cancel messages in the queue
        this.slot.then(() => this.streamFile(fileIndex, fromChunk)).catch((err) => this.failTransfer(err));
        return;
      }
```

Add near `readSlice`:

```ts
function chunkCount(file: TransferFile): number {
  return Math.ceil(file.size / CHUNK_SIZE);
}
```

Change `streamFile`:

```ts
  private async streamFile(fileIndex: number, fromChunk = 0) {
    const file = this.files[fileIndex];
    if (!file) {
      throw new Error(`Receiver requested unknown file #${fileIndex}`);
    }
    const checksum = new FastStreamingChecksum();
    const totalChunks = chunkCount(file);
    // Progress counts files within the selection, not manifest indices
    const position = this.transferIndices().indexOf(fileIndex);
    const channel = this.conn.dataChannel;

    // What the receiver already has is read again here only to check the whole file at the end
    for (let chunkIndex = 0; chunkIndex < fromChunk; chunkIndex++) {
      if (this.isStopped) {
        return;
      }
      const start = chunkIndex * CHUNK_SIZE;
      checksum.update(await readSlice(file, start, Math.min(start + CHUNK_SIZE, file.size)));
    }

    if (this.isStopped) {
      return;
    }
    for (let chunkIndex = fromChunk; chunkIndex < totalChunks; chunkIndex++) {
```

The rest of the loop body and the `FILE_COMPLETE` send are unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/transfer.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sender carries on a cut-off file from where the receiver stopped"
```

---

### Task 5: The receiver carries on with a resume point

**Files:**
- Modify: `src/services/transfer/receiver.ts`
- Modify: `src/types/transfer.ts` (`ReceiverEvents`)
- Test: `src/test/transfer.test.ts` (new `describe('resuming after a dropped connection')`)

**Interfaces:**
- Consumes: `ResumePoint` and `captureInterruption` (Task 3), and sender `fromChunk` support (Task 4).
- Produces:
  - `ReceiverOptions.resumeFrom?: ResumePoint`.
  - `ReceiverEvents.onResumed?: (fileIndices: number[]) => void`, the manifest indices of the download carried on (cut-off file first).
  - `ReceiverEvents.onResumeFailed?: () => void`. The engine has already aborted the writer. The connection stays up with the list.

- [ ] **Step 1: Write the failing tests**

Add after `describe('resume requests', ...)`. Add `ResumePoint` to the import from `'../services/transfer/receiver'`.

```ts
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/transfer.test.ts -t "resuming after a dropped connection"`
Expected: FAIL. `resumeFrom` is ignored, so nothing happens after the manifest.

- [ ] **Step 3: Implement**

`src/types/transfer.ts`, in `ReceiverEvents`:

```ts
  /** A download cut off by a dropped connection carries on: these manifest indices, the cut-off file first */
  onResumed?: (fileIndices: number[]) => void;
  /** It could not carry on (the file is gone, changed or moved in the list); the half-written file was let go */
  onResumeFailed?: () => void;
```

`src/services/transfer/receiver.ts`: add to `ReceiverOptions`:

```ts
  /** A download cut off on an earlier connection, carried on once this one's manifest arrives */
  resumeFrom?: ResumePoint;
```

Add the field `private resumeFrom: ResumePoint | null;`. In the constructor, destructure `resumeFrom` and set `this.resumeFrom = resumeFrom ?? null;` (after `super`).

In `handleMessage`'s `MANIFEST` case, after `this.events.onManifest?.(message.payload);`:

```ts
        if (this.resumeFrom) {
          const resume = this.resumeFrom;
          this.resumeFrom = null;
          this.resume(resume, message.payload);
        }
        return;
```

Add the method:

```ts
  /**
   * Carries on a download cut off on an earlier connection: the same file, still open, from its next chunk, then
   * the rest still offered. Only when that file is still offered unchanged and still comes first.
   */
  private resume(point: ResumePoint, manifest: TransferManifest) {
    const indexOf = new Map(manifest.files.map((file, index) => [file.id, index]));
    const current = indexOf.get(point.fileId);
    const selection = point.remainingIds.flatMap((id) => indexOf.get(id) ?? []).sort((a, b) => a - b);
    if (current === undefined || manifest.files[current].size !== point.fileSize || selection[0] !== current) {
      void point.writer.abort();
      this.events.onResumeFailed?.();
      return;
    }
    const files = selection.map((index) => manifest.files[index]);
    this.createWriter = point.createWriter;
    this.selection = selection;
    this.writer = point.writer;
    this.checksum = point.checksum;
    this.fileIndex = current;
    this.expectedChunkIndex = point.nextChunk;
    this.receivedBytesForFile = point.receivedBytes;
    this.beginTransfer(
      files.reduce((sum, file) => sum + file.size, 0),
      files.length,
      point.receivedBytes
    );
    this.events.onResumed?.(selection);
    const file = manifest.files[current];
    const percent = file.size > 0 ? (point.receivedBytes / file.size) * 100 : 0;
    this.emitMetrics(this.metrics?.snapshot(0, file.name, percent, { isForced: true }));
    if (selection.length < manifest.files.length) {
      this.send({ type: 'FILE_SELECTION', payload: { fileIndices: selection } });
    }
    this.send({ type: 'FILE_START', payload: { fileIndex: current, fromChunk: point.nextChunk } });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/transfer.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: receiver carries on a cut-off download on the next connection"
```

---

### Task 6: Sender state for interrupted downloads

**Files:**
- Modify: `src/types/sharing.ts` (`ReceiverStage`, `SenderReceiver.downloadStartBytes`)
- Modify: `src/hooks/senderState.ts`
- Modify: `src/utils/transferProgress.ts:85`
- Modify: `src/components/ReceiverRow.tsx`
- Modify: `src/App.tsx:55`
- Test: `src/test/senderState.test.ts` (create), `src/test/ReceiverRow.test.tsx` (create)

**Interfaces:**
- Produces:
  - `ReceiverStage` gains `'interrupted'`. `SenderReceiver.downloadStartBytes: number`.
  - Actions `{ type: 'RECEIVER_INTERRUPTED'; peerId: string; finishedCount: number; corruptedFiles: string[] }` and `RECEIVER_STARTED` gains `startBytes: number`.
  - `export const CONNECTION_LOST_MESSAGE = 'Connection lost';` in `senderState.ts`.

- [ ] **Step 1: Write the failing reducer tests**

Create `src/test/senderState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialSenderState, senderReducer } from '../hooks/senderState';
import type { SenderSessionState } from '../hooks/senderState';
import type { TransferFile, TransferMetrics } from '../types/transfer';

const file = (id: string, size: number): TransferFile => ({
  id,
  name: `${id}.bin`,
  size,
  type: 'application/octet-stream',
  rawFile: new File([new Uint8Array(size)], `${id}.bin`),
});

const metrics = (bytesTransferred: number): TransferMetrics => ({
  currentSpeed: 0,
  averageSpeed: 0,
  elapsedSeconds: 1,
  etaSeconds: 0,
  bytesTransferred,
  totalBytes: 300,
  overallPercent: 0,
  currentFileIndex: 1,
  totalFiles: 2,
  currentFileName: 'b.bin',
  currentFilePercent: 50,
  fileSeconds: [1],
});

function downloading(startBytes = 0): SenderSessionState {
  const details = { device: null, timeZone: null, ip: null };
  let state = senderReducer(createInitialSenderState(), { type: 'FILES_ADDED', files: [file('a', 100), file('b', 200)] });
  state = senderReducer(state, { type: 'RECEIVER_ADMITTED', peerId: 'p1', details, atMs: 0 });
  state = senderReducer(state, { type: 'RECEIVER_STARTED', peerId: 'p1', fileIndices: [0, 1], startBytes });
  return senderReducer(state, { type: 'METRICS', peerId: 'p1', metrics: metrics(startBytes + 150) });
}

describe('senderReducer: a download cut off by a dropped connection', () => {
  it('keeps the progress on screen and counts the files finished before the cut as sent', () => {
    const state = senderReducer(downloading(), { type: 'RECEIVER_INTERRUPTED', peerId: 'p1', finishedCount: 1, corruptedFiles: [] });

    const [receiver] = state.receivers;
    expect(receiver.stage).toBe('interrupted');
    expect(receiver.metrics?.bytesTransferred).toBe(150);
    expect(receiver.bytesSent).toBe(150);
    expect(receiver.sentFiles.map((sent) => sent.id)).toEqual(['a']);
    expect(Object.keys(receiver.finishedFiles)).toEqual(['a']);
  });

  it('does not count the same bytes again when it then fails', () => {
    let state = senderReducer(downloading(), { type: 'RECEIVER_INTERRUPTED', peerId: 'p1', finishedCount: 1, corruptedFiles: [] });
    state = senderReducer(state, { type: 'RECEIVER_FAILED', peerId: 'p1', error: 'Connection lost' });

    expect(state.receivers[0].bytesSent).toBe(150);
  });

  it('counts a download carried on from partway only for what it sent', () => {
    let state = senderReducer(downloading(), { type: 'RECEIVER_INTERRUPTED', peerId: 'p1', finishedCount: 1, corruptedFiles: [] });
    state = senderReducer(state, { type: 'RECEIVER_STARTED', peerId: 'p1', fileIndices: [1], startBytes: 50 });
    state = senderReducer(state, { type: 'RECEIVER_COMPLETED', peerId: 'p1', result: { corruptedFiles: [] }, atMs: 1 });

    // a (100) + b (200), each counted once
    expect(state.receivers[0].bytesSent).toBe(300);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/senderState.test.ts`
Expected: FAIL. TypeScript/vitest reports an unknown action, or the stage stays `transferring`.

- [ ] **Step 3: Implement the state**

`src/types/sharing.ts`:

```ts
/** Where one receiver is, from arriving at the link to its download ending. `interrupted`: cut off, reconnecting */
export type ReceiverStage = 'queued' | 'choosing' | 'transferring' | 'interrupted' | 'completed' | 'failed';
```

Add to `SenderReceiver` after `bytesSent`:

```ts
  /** Bytes of the running download already counted in `bytesSent` (it carries on one cut off earlier) */
  downloadStartBytes: number;
```

`src/hooks/senderState.ts`:

- Export `export const CONNECTION_LOST_MESSAGE = 'Connection lost';`.
- Add the action variants `| { type: 'RECEIVER_INTERRUPTED'; peerId: string; finishedCount: number; corruptedFiles: string[] }`, and change `RECEIVER_STARTED` to `{ type: 'RECEIVER_STARTED'; peerId: string; fileIndices: number[]; startBytes: number }`.
- In `newReceiver`, add `downloadStartBytes: 0,`.
- Replace `completeDownload` and add helpers:

```ts
/** What went over the connection in the running download, beyond what an earlier cut-off one already counted. */
function downloadBytesSent(receiver: SenderReceiver): number {
  return Math.max((receiver.metrics?.bytesTransferred ?? 0) - receiver.downloadStartBytes, 0);
}

function withSentFiles(receiver: SenderReceiver, files: ManifestFile[]): ManifestFile[] {
  const sentIds = new Set(receiver.sentFiles.map((file) => file.id));
  return [...receiver.sentFiles, ...files.filter((file) => !sentIds.has(file.id))];
}

function completeDownload(receiver: SenderReceiver, result: TransferResult, atMs: number): SenderReceiver {
  const downloadBytes = receiver.downloadFiles.reduce((sum, file) => sum + file.size, 0);
  return {
    ...receiver,
    stage: 'completed',
    idleSinceMs: atMs,
    isPaused: false,
    bytesSent: receiver.bytesSent + downloadBytes - receiver.downloadStartBytes,
    sentFiles: withSentFiles(receiver, receiver.downloadFiles),
    finishedFiles: { ...receiver.finishedFiles, ...finishedFilesOf(receiver.downloadFiles, receiver.metrics, result) },
  };
}

/** Cut off mid-download: what went over counts as sent, and the files finished before the cut as downloaded. */
function interruptDownload(receiver: SenderReceiver, finishedCount: number, corruptedFiles: string[]): SenderReceiver {
  const finished = receiver.downloadFiles.slice(0, finishedCount);
  return {
    ...receiver,
    stage: 'interrupted',
    idleSinceMs: null,
    isPaused: false,
    bytesSent: receiver.bytesSent + downloadBytesSent(receiver),
    sentFiles: withSentFiles(receiver, finished),
    finishedFiles: { ...receiver.finishedFiles, ...finishedFilesOf(finished, receiver.metrics, { corruptedFiles }) },
  };
}
```

- In the reducer, `RECEIVER_STARTED`: add `downloadStartBytes: action.startBytes,` inside the non-failed branch.
- Add the case:

```ts
    case 'RECEIVER_INTERRUPTED':
      return updateReceiver(state, action.peerId, (receiver) =>
        interruptDownload(receiver, action.finishedCount, action.corruptedFiles)
      );
```

- `RECEIVER_FAILED`: replace the `bytesSent` line with

```ts
        // A cut-off download already counted what got through
        bytesSent: receiver.bytesSent + (receiver.stage === 'interrupted' ? 0 : downloadBytesSent(receiver)),
```

- `STATUS_BY_STAGE`: add `interrupted: 'transferring',`.
- `countActiveReceivers`: `receiver.stage === 'choosing' || receiver.stage === 'transferring' || receiver.stage === 'interrupted'`.

`src/utils/transferProgress.ts:85`:

```ts
  const isDownloading = receiver.stage === 'transferring' || receiver.stage === 'interrupted';
```

`src/App.tsx:55`, inside the `some(...)`:

```ts
    sender.state.receivers.some((r) => r.stage === 'transferring' || r.stage === 'interrupted') || receiver.state.status === 'transferring';
```

- [ ] **Step 4: Run the reducer tests**

Run: `npx vitest run src/test/senderState.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing row test**

Create `src/test/ReceiverRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiverRow } from '../components/ReceiverRow';
import type { SenderReceiver } from '../types/sharing';

const interrupted: SenderReceiver = {
  peerId: 'p1',
  details: { device: 'Chrome on Android', timeZone: null, ip: null },
  stage: 'interrupted',
  idleSinceMs: null,
  hasLeft: false,
  downloadFiles: [{ id: 'a', name: 'a.bin', size: 100, type: '' }],
  sentFiles: [],
  finishedFiles: {},
  bytesSent: 40,
  downloadStartBytes: 0,
  metrics: null,
  isPaused: false,
  error: null,
};

describe('ReceiverRow', () => {
  it('shows someone cut off mid-download as reconnecting, and lets the sender stop them', () => {
    render(<ReceiverRow receiver={interrupted} queuePosition={null} onStop={vi.fn()} onDismiss={vi.fn()} onTogglePause={vi.fn()} />);

    expect(screen.getByTestId('receiver-row')).toHaveTextContent('Reconnecting…');
    expect(screen.getByTitle('Stop download')).toBeInTheDocument();
    expect(screen.queryByTitle('Pause')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/test/ReceiverRow.test.tsx`
Expected: FAIL (no "Reconnecting…", and the stop button is titled "Disconnect").

- [ ] **Step 7: Implement the row**

In `src/components/ReceiverRow.tsx`:

```ts
function presenceOf(receiver: SenderReceiver): Presence {
  if (receiver.hasLeft) {
    return 'gone';
  }
  if (receiver.stage === 'interrupted') {
    return 'waiting';
  }
  return receiver.stage === 'failed' ? 'failed' : 'connected';
}
```

In `describeActivity`'s switch, before `case 'failed':`:

```ts
    case 'interrupted':
      return 'Reconnecting…';
```

Replace the `stopTitles` and `downloadPercent` lines:

```ts
  const isDownloading = receiver.stage === 'transferring' || receiver.stage === 'interrupted';
  const stopTitles = STOP_TITLES[receiver.stage === 'queued' ? 'queued' : isDownloading ? 'transferring' : 'idle'];
```

```ts
  const downloadPercent = isDownloading
    ? (receiver.metrics?.overallPercent ?? 0)
    : receiver.stage === 'queued'
      ? 0
      : receiver.stage === 'completed'
        ? 100
        : null;
```

The `bytesSent` display line stays keyed to `'transferring'` only: an interrupted download's bytes are already in `receiver.bytesSent`.

- [ ] **Step 8: Run the tests and the type check**

Run: `npx vitest run src/test/senderState.test.ts src/test/ReceiverRow.test.tsx`
Expected: PASS.
Run: `npx tsc -b`
Expected: errors only in `src/hooks/senderRoom.ts` (the `RECEIVER_STARTED` dispatch lacks `startBytes`). Fix it now by passing `startBytes: 0` there. Task 7 replaces it.

- [ ] **Step 9: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: sender lists a cut-off download as reconnecting"
```

---

### Task 7: `SenderRoom` holds the slot while a receiver reconnects

**Files:**
- Modify: `src/hooks/senderRoom.ts`
- Modify: `src/hooks/useSenderSession.ts:56-74`
- Test: `src/test/useSenderSession.test.ts`

**Interfaces:**
- Consumes: `SessionSender.interrupt` and `onConnectionLost(interruption)` (Task 3), `onReceiverStarted(fileIndices, startBytes?)` (Task 4), and `RECEIVER_INTERRUPTED`/`RECEIVER_STARTED.startBytes`/`CONNECTION_LOST_MESSAGE` (Task 6).
- Produces:
  - `export const RESERVED_SLOT_MS = 60_000;` in `senderRoom.ts`.
  - `new SenderRoom(services, dispatch, config, { reservedSlotMs? })`.
  - `useSenderSession({ ..., reservedSlotMs? })`.

- [ ] **Step 1: Let the test helpers pass the reservation time**

In `src/test/useSenderSession.test.ts`, change the helpers:

```ts
async function renderSenderSession(configure?: (services: SessionServices) => void, { reservedSlotMs }: { reservedSlotMs?: number } = {}) {
  const fakes = createFakeServices();
  configure?.(fakes.services);
  const hook = renderHook(({ active }) => useSenderSession({ active, settings, services: fakes.services, reservedSlotMs }), {
    initialProps: { active: true },
  });
```

```ts
async function shareWith(
  options: Parameters<ReturnType<typeof useSenderSession>['actions']['setSharingOptions']>[0],
  sessionOptions: { reservedSlotMs?: number } = {}
) {
  const session = await renderSenderSession(undefined, sessionOptions);
```

and inside `describe('with several people')`:

```ts
    async function shareWithLimit(maxSimultaneous = 2, sessionOptions: { reservedSlotMs?: number } = {}) {
      return shareWith({ maxSimultaneous }, sessionOptions);
    }
```

- [ ] **Step 2: Write the failing tests**

Add inside `describe('someone reconnecting from the same tab', ...)`:

```ts
      const cut = (finishedCount = 0) => ({ finishedCount, corruptedFiles: [], resume: null });
      const tab = 'tab-aaaaaaaaaaaaaaaa';

      it('holds their download slot while they reconnect, and carries on in it', async () => {
        const session = await shareWithLimit(1);
        const first = connectPeer(session, 'p1', fromTab(session, tab));
        startDownloading(session, 0);
        connectPeer(session, 'p2', linkGreeting(session));

        act(() => {
          session.engines[0].events.onConnectionLost?.(cut());
        });
        // Otherwise the same tab coming back would count as a duplicated tab
        Object.assign(first, { open: false });
        expect(stages(session)).toEqual(['interrupted', 'choosing']);
        // Someone else starting now waits: the slot is kept for the person reconnecting
        startDownloading(session, 1);
        expect(stages(session)).toEqual(['interrupted', 'queued']);

        connectPeer(session, 'p1-again', fromTab(session, tab));
        act(() => {
          session.engines[2].events.onReceiverStarted?.([0], 64 * 1024);
        });

        expect(stages(session)).toEqual(['transferring', 'queued']);
        expect(session.engines[2].holdUntil).not.toHaveBeenCalled();
        expect(session.effects.onTransferEnded).not.toHaveBeenCalled();
      });

      it('gives the slot to the next in line when they do not come back in time', async () => {
        const session = await shareWithLimit(1, { reservedSlotMs: 10 });
        connectPeer(session, 'p1', fromTab(session, tab));
        connectPeer(session, 'p2', linkGreeting(session));
        startDownloading(session, 0);
        startDownloading(session, 1);

        act(() => {
          session.engines[0].events.onConnectionLost?.(cut());
        });

        await waitFor(() => expect(stages(session)).toEqual(['failed', 'transferring']));
        expect(session.result.current.state.receivers[0].error).toBe('Connection lost');
      });

      it('marks the files finished before the cut as sent', async () => {
        const session = await shareWithLimit(1);
        connectPeer(session, 'p1', fromTab(session, tab));
        startDownloading(session, 0);

        act(() => {
          session.engines[0].events.onConnectionLost?.(cut(1));
        });

        expect(session.result.current.state.receivers[0].sentFiles.map((file) => file.name)).toEqual(['hello.txt']);
      });

      it('treats a connection replaced before its drop was noticed as a cut, keeping the slot', async () => {
        const session = await shareWithLimit(1);
        const first = connectPeer(session, 'p1', fromTab(session, tab));
        startDownloading(session, 0);
        session.engines[0].interrupt.mockReturnValue(cut());
        Object.assign(first, { open: false });

        connectPeer(session, 'p1-again', fromTab(session, tab));

        expect(session.connection.disconnectPeer).toHaveBeenCalledWith('p1');
        expect(session.effects.onTransferEnded).not.toHaveBeenCalled();
        act(() => {
          session.engines[1].events.onReceiverStarted?.([0], 64 * 1024);
        });
        expect(stages(session)).toEqual(['transferring']);
      });

      it('stops someone while they reconnect, freeing their slot', async () => {
        const session = await shareWithLimit(1);
        connectPeer(session, 'p1', fromTab(session, tab));
        startDownloading(session, 0);
        act(() => {
          session.engines[0].events.onConnectionLost?.(cut());
        });

        act(() => {
          session.result.current.actions.stopReceiver('p1');
        });

        expect(session.result.current.state.receivers).toEqual([]);
        expect(session.effects.onTransferEnded).toHaveBeenCalledWith(false);
      });

      it('does not hold a slot for someone it could not recognise on return', async () => {
        const session = await shareWithLimit(1);
        connectPeer(session, 'p1', linkGreeting(session));
        startDownloading(session, 0);

        act(() => {
          session.engines[0].events.onConnectionLost?.(cut());
        });

        expect(stages(session)).toEqual(['failed']);
        expect(session.effects.onTransferEnded).toHaveBeenCalledWith(false);
      });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/test/useSenderSession.test.ts -t "someone reconnecting"`
Expected: FAIL. The room never wires `onConnectionLost`, and `reservedSlotMs` is unknown.

- [ ] **Step 4: Implement**

`src/hooks/useSenderSession.ts`: add `reservedSlotMs?: number;` to `UseSenderSessionOptions` (doc: `/** How long a download cut off by a dropped connection keeps its slot; shortened in tests */`). Destructure it and pass it on:

```ts
    () =>
      new SenderRoom(
        services,
        dispatch,
        { files: state.files, options: state.options, isShared: state.isShared },
        { reservedSlotMs }
      )
```

`src/hooks/senderRoom.ts`:

Imports: `import type { DownloadInterruption } from '../types/transfer';` (merge into the existing `AppSettings, TransferFile` import) and `import { CONNECTION_LOST_MESSAGE } from './senderState';` (value import next to the existing `SenderAction` type import).

Constants and types:

```ts
/** How long a download cut off by a dropped connection keeps its slot for the same tab to come back */
export const RESERVED_SLOT_MS = 60_000;

interface Reservation {
  /** The receiver's latest connection; moves when the same tab comes back */
  peerId: string;
  /** Held a download slot when cut off (not just a place in line) */
  hasSlot: boolean;
  timer: ReturnType<typeof setTimeout>;
}
```

Fields and constructor:

```ts
  // Downloads cut off by a dropped connection, by browser tab, until they carry on or give up
  private readonly reservations = new Map<string, Reservation>();
  private readonly reservedSlotMs: number;

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
```

`stop` (replace):

```ts
  /** Disconnects one person: their download stops, or they leave the line. */
  public stop(peerId: string) {
    const sessionId = this.sessionOf.get(peerId);
    const engine = this.engines.get(peerId);
    const reservation = sessionId ? this.reservations.get(sessionId) : undefined;
    if (!engine && reservation?.peerId !== peerId) {
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
```

`teardown`: add, before `this.engines.clear();`:

```ts
    this.reservations.forEach((reservation) => clearTimeout(reservation.timer));
    this.reservations.clear();
```

`resumeSession`: replace the `if (this.engines.has(previous.peer)) { ... }` block and the dispatch:

```ts
    const previousEngine = this.engines.get(previous.peer);
    if (previousEngine) {
      // Its close has not been noticed yet; the new connection replaces it
      const interruption = previousEngine.interrupt();
      if (interruption) {
        this.interruptDownload(previous.peer, interruption);
      } else {
        this.connection?.disconnectPeer(previous.peer);
        this.endEngine(previous.peer, false);
      }
    }
    this.moveReservation(sessionId, conn.peer);
    this.dispatch({ type: 'RECEIVER_RESUMED', fromPeerId: previous.peer, peerId: conn.peer });
```

`startDownload` (replace):

```ts
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
```

In `startEngine`, change the `onReceiverStarted` handler and add `onConnectionLost`:

```ts
      onReceiverStarted: ifCurrent((fileIndices, startBytes) => {
        hasReceiverStarted = true;
        this.startDownload(conn, engine, fileIndices, startBytes ?? 0);
      }),
      onConnectionLost: ifCurrent((interruption) => this.interruptDownload(peerId, interruption)),
```

Add the new private methods (after `announcePositions`):

```ts
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
    const timer = setTimeout(() => this.expireReservation(sessionId), this.reservedSlotMs);
    this.reservations.set(sessionId, { peerId, hasSlot: this.busy.has(peerId), timer });
  }

  /** The same tab is back on a new connection: what was kept for it follows. */
  private moveReservation(sessionId: string, peerId: string) {
    const reservation = this.reservations.get(sessionId);
    if (!reservation) {
      return;
    }
    if (reservation.hasSlot) {
      this.busy.delete(reservation.peerId);
      this.busy.add(peerId);
    }
    reservation.peerId = peerId;
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
```

Replace the queue filter in `endEngine` with `this.leaveLine(peerId);`.

- [ ] **Step 5: Run the sender session tests**

Run: `npx vitest run src/test/useSenderSession.test.ts`
Expected: PASS (all). The existing "replaces a connection whose drop has not been noticed yet" test still frees the slot, because the fake `interrupt` returns `null`.

- [ ] **Step 6: Run the full unit suite and the type check**

Run: `npm test` then `npx tsc -b`
Expected: PASS, no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: sender keeps a cut-off download's slot while its receiver reconnects"
```

---

### Task 8: Receiver session carries the download across a reconnect

**Files:**
- Modify: `src/hooks/receiverState.ts`
- Modify: `src/hooks/useReceiverSession.ts`
- Test: `src/test/useReceiverSession.test.ts`

**Interfaces:**
- Consumes: `SessionReceiver.interrupt`, `ReceiverOptions.resumeFrom`, `onResumed`, `onResumeFailed`, and `onConnectionLost(interruption)` (Tasks 3 and 5).
- Produces:
  - `ReceiverSessionState.isInterrupted: boolean` and `hasInterruptedDownload: boolean`.
  - Actions `DOWNLOAD_INTERRUPTED {finishedCount, corruptedFiles}`, `DOWNLOAD_RESUMED {fileIndices}` and `RESUME_FAILED`.

- [ ] **Step 1: Write the failing tests**

Append to `src/test/useReceiverSession.test.ts`. Add `vi` to the vitest import, and `import type { ResumePoint } from '../services/transfer/receiver';`.

```ts
describe('useReceiverSession: a download cut off by a dropped connection', () => {
  const twoFiles: TransferManifest = {
    totalBytes: 10,
    files: [
      { id: 'f1', name: 'one.txt', size: 5, type: 'text/plain' },
      { id: 'f2', name: 'two.txt', size: 5, type: 'text/plain' },
    ],
  };
  const resumePoint = () => ({ writer: { abort: vi.fn().mockResolvedValue(undefined) } }) as unknown as ResumePoint;
  const cut = (resume: ResumePoint | null, finishedCount = 0) => ({ finishedCount, corruptedFiles: [], resume });

  async function downloading(pin = '') {
    const session = renderReceiverSession();
    const { engine } = await connect(session);
    act(() => {
      engine.events.onManifest?.(twoFiles);
      session.result.current.actions.setPin(pin);
    });
    await act(async () => {
      await session.result.current.actions.startSaving();
    });
    return { session, engine };
  }

  async function cutOff(session: ReturnType<typeof renderReceiverSession>, engine: FakeTransfer, resume: ResumePoint | null, finishedCount = 0) {
    act(() => {
      engine.events.onConnectionLost?.(cut(resume, finishedCount));
    });
    await waitFor(() => expect(session.engines).toHaveLength(2));
    return session.engines[1];
  }

  it('keeps the download on screen and hands the open file to the next connection', async () => {
    const { session, engine } = await downloading();
    const resume = resumePoint();

    const next = await cutOff(session, engine, resume, 1);

    expect(session.result.current.state).toMatchObject({ status: 'transferring', isInterrupted: true });
    expect(Object.keys(session.result.current.state.finishedFiles)).toEqual(['f1']);
    expect(next.options.resumeFrom).toBe(resume);
    expect(engine.cancel).not.toHaveBeenCalled();
    expect(session.effects.onTransferEnded).not.toHaveBeenCalled();
  });

  it('carries on once the sender is back', async () => {
    const { session, engine } = await downloading();
    const next = await cutOff(session, engine, resumePoint(), 1);

    act(() => {
      next.events.onManifest?.(twoFiles);
      next.events.onResumed?.([1]);
    });

    expect(session.result.current.state).toMatchObject({ status: 'transferring', isInterrupted: false, selectedFileIndices: [1] });
  });

  it('offers what is still missing when it cannot carry on', async () => {
    const { session, engine } = await downloading();
    const next = await cutOff(session, engine, resumePoint(), 1);

    act(() => {
      next.events.onManifest?.(twoFiles);
      next.events.onResumeFailed?.();
    });

    expect(session.result.current.state).toMatchObject({ status: 'connected', isInterrupted: false, hasInterruptedDownload: true });
    expect(Object.keys(session.result.current.state.finishedFiles)).toEqual(['f1']);
    expect(session.effects.onTransferEnded).toHaveBeenCalledWith(false);
  });

  it('offers what is still missing when the cut left no file open', async () => {
    const { session, engine } = await downloading();
    const next = await cutOff(session, engine, null, 1);

    act(() => {
      next.events.onManifest?.(twoFiles);
    });

    expect(next.options.resumeFrom).toBeUndefined();
    expect(session.result.current.state).toMatchObject({ status: 'connected', hasInterruptedDownload: true });
  });

  it('keeps the open file through another drop before the sender answers', async () => {
    const { session, engine } = await downloading();
    const resume = resumePoint();
    const next = await cutOff(session, engine, resume);

    act(() => {
      next.events.onPeerLeft?.();
    });
    await waitFor(() => expect(session.engines).toHaveLength(3));

    expect(session.engines[2].options.resumeFrom).toBe(resume);
    expect(resume.writer.abort).not.toHaveBeenCalled();
    expect(session.result.current.state.status).toBe('transferring');
  });

  it('lets go of the half-written file when the user stops', async () => {
    const { session, engine } = await downloading();
    const resume = resumePoint();
    await cutOff(session, engine, resume);

    act(() => {
      session.result.current.actions.cancel();
    });

    expect(resume.writer.abort).toHaveBeenCalled();
    expect(session.effects.onTransferEnded).toHaveBeenCalledWith(false);
  });

  it('enters the PIN typed before when reconnecting to carry on', async () => {
    const { session, engine } = await downloading('2468');
    const next = await cutOff(session, engine, resumePoint());

    act(() => {
      next.events.onPinRequired?.({ attemptsLeft: 3, isIncorrect: false });
    });

    expect(next.submitPin).toHaveBeenCalledWith('2468');
    expect(session.result.current.state.status).toBe('transferring');
  });

  it('asks for the PIN when the one typed before is refused', async () => {
    const { session, engine } = await downloading('2468');
    const next = await cutOff(session, engine, resumePoint());

    act(() => {
      next.events.onPinRequired?.({ attemptsLeft: 2, isIncorrect: true });
    });

    expect(session.result.current.state.status).toBe('pin_required');
  });

  it('asks the engine for what it leaves behind when the signalling connection goes first', async () => {
    const { session, engine } = await downloading();
    const resume = resumePoint();
    engine.interrupt.mockReturnValue(cut(resume));

    act(() => {
      session.connections[0].handlers.onDisconnected?.();
    });
    await waitFor(() => expect(session.engines).toHaveLength(2));

    expect(session.engines[1].options.resumeFrom).toBe(resume);
  });
});
```

Add `FakeTransfer` to the import from `./utils/fakeSessionServices`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/useReceiverSession.test.ts -t "cut off"`
Expected: FAIL. The hook cancels the engine and `isInterrupted` is undefined.

- [ ] **Step 3: Implement the reducer**

In `src/hooks/receiverState.ts`, add to `ReceiverSessionState`:

```ts
  /** A download cut off by a dropped connection, waiting for the sender to be back so it can carry on */
  isInterrupted: boolean;
  /** A cut-off download could not carry on; the list offers what is still missing */
  hasInterruptedDownload: boolean;
```

Add to `ReceiverAction`:

```ts
  | { type: 'DOWNLOAD_INTERRUPTED'; finishedCount: number; corruptedFiles: string[] }
  | { type: 'DOWNLOAD_RESUMED'; fileIndices: number[] }
  | { type: 'RESUME_FAILED' }
```

Add `isInterrupted: false, hasInterruptedDownload: false,` to `initialReceiverState`.

Cases (replace or add):

```ts
    case 'CONNECT_REQUESTED':
      return {
        ...state,
        ...noProgress,
        status: 'connecting',
        isInvited: false,
        queuePosition: null,
        error: null,
        manifest: null,
        corruptedFiles: [],
        finishedFiles: {},
        hasSenderLeft: false,
        isInterrupted: false,
        hasInterruptedDownload: false,
      };
    case 'CONNECTED':
      // Back to carry on a cut-off download: it stays on screen
      return state.isInterrupted
        ? { ...state, isInvited: action.isInvited }
        : { ...state, status: 'waiting_approval', isInvited: action.isInvited };
    case 'CONNECT_FAILED':
      return { ...state, status: 'error', error: action.error, isInterrupted: false, hasInterruptedDownload: false };
```

In `MANIFEST_RECEIVED`, the status line becomes:

```ts
        status: state.status === 'completed' ? 'completed' : state.isInterrupted ? 'transferring' : 'connected',
```

New cases:

```ts
    case 'DOWNLOAD_INTERRUPTED':
      return {
        ...state,
        isInterrupted: true,
        isPaused: false,
        queuePosition: null,
        finishedFiles: {
          ...state.finishedFiles,
          ...finishedFilesOf(
            pickFiles(state.manifest?.files ?? [], state.selectedFileIndices).slice(0, action.finishedCount),
            state.metrics,
            { corruptedFiles: action.corruptedFiles }
          ),
        },
      };
    case 'DOWNLOAD_RESUMED':
      return {
        ...state,
        ...noProgress,
        status: 'transferring',
        isInterrupted: false,
        selectedFileIndices: action.fileIndices,
        queuePosition: null,
        corruptedFiles: [],
      };
    case 'RESUME_FAILED':
      return { ...state, ...noProgress, status: 'connected', isInterrupted: false, hasInterruptedDownload: true, queuePosition: null };
```

In `SAVING_STARTED`, add `hasInterruptedDownload: false,`. In `FAILED`'s non-completed return and in `CANCELLED`, add `isInterrupted: false, hasInterruptedDownload: false`.

- [ ] **Step 4: Implement the hook**

In `src/hooks/useReceiverSession.ts`:

Imports: `import type { AppSettings, DownloadInterruption } from '../types/transfer';` and `import type { ResumePoint } from '../services/transfer/receiver';`.

Refs, after `settingsRef`:

```ts
  // The open file of a download cut off by a dropped connection, for the next connection to carry on with
  const resumeRef = useRef<ResumePoint | null>(null);
  // From a download being cut off until it carries on or cannot; reconnecting keeps it (and device effects) going
  const isInterruptedRef = useRef(false);
  const pinRef = useRef(state.pin);

  useEffect(() => {
    pinRef.current = state.pin;
  }, [state.pin]);

  /** Gives up on carrying on a cut-off download, closing its half-written file. */
  const dropResume = useCallback(() => {
    void resumeRef.current?.writer.abort();
    resumeRef.current = null;
    isInterruptedRef.current = false;
  }, []);
```

`teardown`, replace `endRun(false);` with:

```ts
    // A cut-off download is still under way while reconnecting
    if (!isInterruptedRef.current) {
      endRun(false);
    }
```

The deactivate effect's cleanup becomes `dropResume(); teardown(); dispatch({ type: 'RESET' });`, with `dropResume` added to its deps.

In `connectToRoom`:

- `if (reconnectAttempt === 0) { dropResume(); dispatch({ type: 'CONNECT_REQUESTED' }); }`
- `scheduleReconnect`:

```ts
      const scheduleReconnect = (attempt: number) => {
        teardown();
        if (!isInterruptedRef.current) {
          dispatch({ type: 'RECONNECTING' });
        }
        reconnectTargetRef.current = { roomCode, link };
        const delayMs = reconnectDelayMs * Math.min(attempt, MAX_RECONNECT_BACKOFF);
        reconnectTimerRef.current = setTimeout(() => connectToRoom(roomCode, link, attempt), delayMs);
      };
```

- `handleSenderGone`:

```ts
      // Reached from both the signalling connection closing and the engine losing its data channel. Unless this
      // side left on purpose, the sender is tried again: a reload or a network blip should not end the session.
      // A download under way is carried on from where it stopped once the sender is back
      const handleSenderGone = (interruption?: DownloadInterruption | null) => {
        if (connectionRef.current !== connection || hasLeftRef.current) {
          return;
        }
        if (hasStartedSavingRef.current) {
          hasStartedSavingRef.current = false;
          const cut = interruption ?? engineRef.current?.interrupt() ?? null;
          if (cut) {
            resumeRef.current = cut.resume;
            isInterruptedRef.current = true;
            dispatch({ type: 'DOWNLOAD_INTERRUPTED', finishedCount: cut.finishedCount, corruptedFiles: cut.corruptedFiles });
          } else {
            engineRef.current?.cancel();
          }
        }
        scheduleReconnect(1);
      };
```

- The connection's `onDisconnected` handler must not pass its argument through as an interruption. Change `onDisconnected: handleSenderGone,` in `services.createConnection({...})` to:

```ts
        onDisconnected: () => handleSenderGone(),
```

- `handleResumeFailed`, next to it:

```ts
      const handleResumeFailed = () => {
        // The engine already let go of the half-written file
        resumeRef.current = null;
        isInterruptedRef.current = false;
        endRun(false);
        dispatch({ type: 'RESUME_FAILED' });
      };
```

- Before `services.createReceiver(...)`:

```ts
        // Kept here, not handed off, until the engine carries on or cannot: another drop before then keeps it
        const resumeFrom = resumeRef.current ?? undefined;
        // Cut off with no file open (between two files): the list comes back with what is still missing
        let isAwaitingFallback = isInterruptedRef.current && !resumeFrom;
```

- Events (replace or add):

```ts
            onPinRequired: ifCurrent((prompt) => {
              // Carrying on after a cut: the PIN typed before still works, unless it was just refused
              if (isInterruptedRef.current && !prompt.isIncorrect && pinRef.current) {
                engine.submitPin(pinRef.current);
                return;
              }
              dispatch({ type: 'PIN_REQUIRED', prompt });
            }),
            onManifest: ifCurrent((manifest) => {
              dispatch({ type: 'MANIFEST_RECEIVED', manifest });
              if (isAwaitingFallback) {
                isAwaitingFallback = false;
                handleResumeFailed();
              }
            }),
            onResumed: ifCurrent((fileIndices) => {
              resumeRef.current = null;
              isInterruptedRef.current = false;
              hasStartedSavingRef.current = true;
              dispatch({ type: 'DOWNLOAD_RESUMED', fileIndices });
            }),
            onResumeFailed: ifCurrent(handleResumeFailed),
```

`onError` and `onCancelled`: call `dropResume();` first. The options argument becomes `{ shareKey, introduction, resumeFrom }`.

- Catch block's final failure: `dropResume(); teardown(); dispatch({ type: 'CONNECT_FAILED', ... })`.
- `connectTo`'s deps: add `dropResume`.
- The `cancel` action and `reset` action: call `dropResume();` first.

- [ ] **Step 5: Run the receiver session tests**

Run: `npx vitest run src/test/useReceiverSession.test.ts`
Expected: PASS (all, including the existing reconnect tests).

- [ ] **Step 6: Run the full unit suite and the type check**

Run: `npm test` then `npx tsc -b`
Expected: PASS, no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: receiver carries a cut-off download across the reconnect"
```

---

### Task 9: Receiver UI while reconnecting and after a failed resume

**Files:**
- Modify: `src/components/TransferSummary.tsx`
- Modify: `src/components/IncomingFilesCard.tsx`
- Modify: `src/components/ReceiverView.tsx:57-75`
- Test: `src/test/TransferSummary.test.tsx`, `src/test/ReceiverView.test.tsx`

**Interfaces:**
- Consumes: `state.isInterrupted` and `state.hasInterruptedDownload` (Task 8).
- Produces: `TransferSummary` prop `isReconnecting?: boolean`, and `IncomingFilesCard` prop `hasInterruptedDownload?: boolean`.

- [ ] **Step 1: Write the failing tests**

`src/test/TransferSummary.test.tsx`, append inside the top-level `describe`:

```tsx
  it('says it is reconnecting while a cut-off download waits for the sender', () => {
    expect(renderSummary({ isReconnecting: true })).toContain('Reconnecting…');
  });
```

`src/test/ReceiverView.test.tsx`, append inside the `describe`:

```tsx
  it('shows the download reconnecting after a dropped connection', () => {
    renderReceiver('transferring', { manifest: dummyManifest, metrics: dummyMetrics, isInterrupted: true });

    expect(screen.getByTestId('transfer-summary')).toHaveTextContent('Reconnecting…');
  });

  it('offers only what is still missing when a cut-off download could not carry on', () => {
    const manifest: TransferManifest = {
      totalBytes: 2,
      files: [
        { id: 'f1', name: 'got.txt', size: 1, type: 'text/plain' },
        { id: 'f2', name: 'missing.txt', size: 1, type: 'text/plain' },
      ],
    };

    renderReceiver('connected', {
      manifest,
      finishedFiles: { f1: { seconds: 1, isCorrupted: false } },
      hasInterruptedDownload: true,
    });

    expect(screen.getByText('Download was interrupted.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /got\.txt/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /missing\.txt/ })).toBeChecked();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/TransferSummary.test.tsx src/test/ReceiverView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `TransferSummary`**

Add the prop:

```ts
  /** A cut-off download waiting for the sender to be back */
  isReconnecting?: boolean;
```

Destructure `isReconnecting = false`, and add a branch right after `if (completion) { ... }`:

```tsx
  } else if (isReconnecting) {
    icon = <Spinner className="w-4 h-4 border-2 text-text-4" />;
    title = 'Reconnecting…';
```

- [ ] **Step 4: Implement `IncomingFilesCard`**

Add the prop:

```ts
  /** A cut-off download could not carry on: say so, and tick only what is still missing */
  hasInterruptedDownload?: boolean;
```

Destructure `hasInterruptedDownload = false`. After the `excludedIds` state:

```tsx
  // When a cut-off download could not carry on, what was already saved starts unticked (adjusted during render)
  const [shownInterruption, setShownInterruption] = useState(false);
  if (hasInterruptedDownload !== shownInterruption) {
    setShownInterruption(hasInterruptedDownload);
    if (hasInterruptedDownload) {
      setExcludedIds(new Set(Object.keys(finishedFiles)));
    }
  }
```

Before the `hasSenderLeft` notice:

```tsx
        {hasInterruptedDownload && (
          <Notice tone="warning" icon={Unplug} className="mt-3">
            Download was interrupted.
          </Notice>
        )}
```

- [ ] **Step 5: Wire `ReceiverView`**

Pass `isReconnecting={isTransferring && state.isInterrupted}` to `TransferSummary`, and `hasInterruptedDownload={state.hasInterruptedDownload}` to `IncomingFilesCard`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/test/TransferSummary.test.tsx src/test/ReceiverView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Look at it in Chrome**

Run `npm run dev`. Open the sender in one tab and the receiver link in another. Add a large file (≥ 500 MB), start the download, then reload the sender tab mid-transfer. Check:
- The receiver shows "Reconnecting…" over the list, with progress kept.
- The sender's row shows a pulsing yellow dot and "Reconnecting…" after it restores its files (Restore click if asked).
- The download carries on from where it stopped and finishes Done.

If the files come back as missing instead, add a different file on the sender. The receiver should then show "Download was interrupted." with only the new file ticked.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: receiver shows a cut-off download reconnecting, and what is left when it cannot carry on"
```

---

### Task 10: End-to-end check of the fallback

**Files:**
- Modify: `e2e/transfer.spec.ts` (helpers `openReceiver`, `openPeers`; new test)

**Interfaces:**
- Consumes: everything above, through the real app.

- [ ] **Step 1: Let receivers write slowly**

Change `openReceiver` and `openPeers`:

```ts
/** A receiver in its own browser context, with file pickers stubbed to write nowhere (each write taking `writeDelayMs`). */
async function openReceiver(browser: Browser, { writeDelayMs = 0 }: { writeDelayMs?: number } = {}) {
  const context = await newLocalContext(browser);
  const page = await context.newPage();
  await page.addInitScript((delayMs) => {
    const write = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const createWritable = async () => ({ write, close: async () => {}, abort: async () => {} });
    const fileHandle = { createWritable };
    const directoryHandle = {
      getFileHandle: async () => fileHandle,
      getDirectoryHandle: async () => directoryHandle,
    };
    (window as any).showSaveFilePicker = async () => fileHandle;
    (window as any).showDirectoryPicker = async () => directoryHandle;
  }, writeDelayMs);
  return { page, close: () => context.close() };
}

/** Two isolated browser contexts: a sender and one receiver. */
async function openPeers(browser: Browser, receiverOptions: { writeDelayMs?: number } = {}) {
  const senderContext = await newLocalContext(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const senderPage = await senderContext.newPage();
  const receiver = await openReceiver(browser, receiverOptions);
```

(The rest of `openPeers` is unchanged.)

- [ ] **Step 2: Write the test**

Add before the PIN `test.fixme`:

```ts
  test('sender reload mid-download: the receiver reconnects and offers what is left', async ({ browser }) => {
    // 4 MB at 100 ms per 64 KB chunk takes about 6 s, long enough to reload the sender partway
    const { senderPage, receiverPage, close } = await openPeers(browser, { writeDelayMs: 100 });

    await senderPage.goto('/');
    await addFile(senderPage, 'small.txt', 'first');
    await addFile(senderPage, 'large.bin', 'x'.repeat(4 * 1024 * 1024), 'application/octet-stream');
    const link = await shareFiles(senderPage);

    await receiverPage.goto(link);
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.locator('[data-status=done]')).toHaveCount(1, { timeout: 15000 });

    // Files added through the plain input cannot be read back after a reload, so the cut-off file is gone
    senderPage.on('dialog', (dialog) => dialog.accept());
    await senderPage.reload();
    await expect(receiverPage.getByTestId('transfer-summary')).toContainText('Reconnecting', { timeout: 15000 });
    await addFile(senderPage, 'other.txt', 'something else');

    await expect(receiverPage.getByText('Download was interrupted.')).toBeVisible({ timeout: 30000 });
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });
    await close();
  });
```

- [ ] **Step 3: Run it**

Run: `npx playwright test -g "sender reload mid-download"` (set `E2E_PORT=5199` if port 5173 is busy)
Expected: PASS.

- [ ] **Step 4: Run the whole e2e suite**

Run: `npm run test:e2e`
Expected: PASS (fixme tests skipped).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: e2e for a sender reload mid-download"
```

---

### Task 11: Documentation and final checks

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

1. In the Admission paragraph, replace `A download cut off midway starts again from the beginning.` with:
   `A download cut off by a dropped connection carries on where it stopped: the receiver engine hands its still-open file over as a ResumePoint (`TransferPeer.interrupt()` / `onConnectionLost(interruption)`), the hook keeps it while reconnecting and gives it to the next engine (`resumeFrom`), which after the manifest sends `FILE_START {fileIndex, fromChunk}`; the sender re-reads the part already sent only to seed the CRC. If the file is gone, changed or moved in the list (or none was open), the list comes back with the finished files unticked and "Download was interrupted." A receiver reload loses the partial file (Chromium's swap file).`
2. In the Flow paragraph, change `then \`FILE_START\`` to `then \`FILE_START\` (with \`fromChunk\` when carrying on a cut-off file; only on a download's first file)`.
3. In the `hooks/useSenderSession.ts` bullet, after `(\`holdUntil\`)`, add: `; a download cut off by a dropped connection shows as \`interrupted\` ("Reconnecting…") and keeps its slot, reserved per \`sessionId\` for \`RESERVED_SLOT_MS\` (60 s), which \`RECEIVER_RESUMED\` moves to the new connection and the next download uses at once`.
4. In the same bullet, after the receiver's reducer mention, add: `; a cut-off download keeps \`isInterrupted\` (still \`transferring\`) until it carries on (\`DOWNLOAD_RESUMED\`) or cannot (\`RESUME_FAILED\`, \`hasInterruptedDownload\`)`.
5. In "Invariants that tests rely on", replace `A connection closing while a transfer is active surfaces as \`onError\`.` with `A connection closing while a transfer is active surfaces as \`onConnectionLost(interruption)\` when handled, otherwise \`onError\`. The receiver counts a chunk (checksum, next index, bytes) before awaiting its write, so a cut at any moment leaves a consistent resume point.`

- [ ] **Step 2: Run everything**

Run: `npm run lint`
Expected: no warnings.
Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: CLAUDE.md describes resumable transfers"
```
