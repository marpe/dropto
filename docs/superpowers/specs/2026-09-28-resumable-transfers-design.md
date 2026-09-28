# Resumable transfers

Date: 2026-09-28
Status: approved design, awaiting implementation plan

## Goal

A download cut off by a dropped connection carries on where it stopped instead of failing, with no click and no second save dialog. When that is impossible, the receiver lands back on the file list with only the unfinished files ticked, so one click downloads the rest.

## Scope

In scope:

- Network blips and short sleeps while both tabs stay open.
- A sender reload whose files come back (IndexedDB handles or one Restore click); the room and key already survive a reload.
- Remembering files finished before a cut on both sides (today the receiver only records them when a whole download completes).

Out of scope:

- Surviving a receiver reload or crash. Chromium's `createWritable()` writes to a `.crswap` swap file that is discarded unless `close()` runs, and the memory fallback lives in the tab; the partial file is lost with it.
- Keeping pause state across a resume (a resumed download starts running).
- Keeping a place in line for someone who was waiting (they rejoin at the back).

## Approach

Engines stay one per connection (`TransferPeer`'s invariant, `ifCurrent` guards). When a connection drops mid-download, the receiver engine hands its open file over as a plain `ResumePoint` value; the session hook keeps it while reconnecting and gives it to the next engine. The sender keeps no transfer state: the receiver is the only side that knows how much arrived, and a sender reload would wipe anything the sender remembered.

Rejected: a reattachable engine (`attach(newConn)`), which breaks the one-connection invariant and risks stale messages from the old connection; sender-side progress per `sessionId`, which does not survive a sender reload.

## Protocol

- `FILE_START {fileIndex, fromChunk?}`. `fromChunk` is an integer ≥ 0 and ≤ the file's chunk count, allowed only on the first `FILE_START` of a download. Anything else is a fatal protocol error (`failTransfer`). `parseControlMessage` validates the field.
- A resumed download is "the rest": the selection is the cut-off file plus the unfinished files after it (by id, mapped to the current manifest), sent with the usual `FILE_SELECTION` when it is a subset. Only its first file starts at `fromChunk`; later files start at 0 as usual.
- No other message changes. `FILE_COMPLETE` still carries the whole-file CRC-32 and `FILE_ACK` still verifies it.

## Receiver engine (`services/transfer/receiver.ts`)

```ts
interface ResumePoint {
  createWriter: WriterFactory;
  writer: StorageWriter;          // still open
  checksum: FastStreamingChecksum; // covers bytes 0..receivedBytes
  fileId: string;
  fileSize: number;
  nextChunk: number;
  receivedBytes: number;
  remainingIds: string[];          // cut-off file first, then the unfinished ones after it
}
```

- On connection loss with a file open, the engine does not abort the writer. It emits `onConnectionLost(resume)` with the `ResumePoint` (null when no file was open, e.g. between two files while the next one's writer is being prepared; the hook then treats it like `RESUME_FAILED` once reconnected). A receiver waiting in line already has its first file open with 0 bytes, so it resumes from chunk 0.
- `ReceiverOptions.resumeFrom?: ResumePoint`. On the first `MANIFEST`:
  - The cut-off file must be present with the same `id` and `size`, and have the lowest manifest index among the remaining ids still offered (the protocol requires increasing indices and the resumed file must come first).
  - If so, the engine adopts the writer, factory and checksum, sets `fileIndex`, `expectedChunkIndex = nextChunk`, `receivedBytesForFile = receivedBytes`, starts metrics with `startBytes = receivedBytes`, and sends `FILE_SELECTION` (if a subset) and `FILE_START {fileIndex, fromChunk: nextChunk}` itself. No picker is involved, so no user gesture is needed.
  - Remaining files no longer offered are skipped; they stay unfinished in the list.
  - Otherwise it aborts the writer and emits `onResumeFailed()`; the connection stays open and the manifest is delivered as usual.
- Chunks are aligned to `CHUNK_SIZE`, and the receiver only counts chunks it wrote, so anything lost in flight is simply sent again.

## Sender engine (`services/transfer/sender.ts`)

- `streamFile(fileIndex, fromChunk = 0)`: when `fromChunk > 0`, first read `[0, fromChunk * CHUNK_SIZE)` in `CHUNK_SIZE` slices through `readSlice` to seed the CRC (nothing is sent; stop early if `isStopped`), then stream from `fromChunk`.
- `beginTransfer` for a resumed download passes `startBytes = fromChunk * CHUNK_SIZE`.
- Losing the connection mid-download reports `onConnectionLost()` (the sender room wires it) instead of `onError`.

## Metrics (`services/transfer/metrics.ts`)

- `TransferMetricsTracker` takes `startBytes` (default 0): `bytesTransferred` starts there, so overall and file percent continue. Those bytes are not speed samples and do not start the clock, so speed and elapsed time reflect only the resumed part.
- `TransferPeer.beginTransfer(totalBytes, totalFiles, startBytes = 0)` passes it through.

## Receiver session (`hooks/useReceiverSession.ts`, `hooks/receiverState.ts`)

- `onConnectionLost(resume)`: instead of cancelling the engine, keep `resume` in a `resumePointRef`, dispatch `DOWNLOAD_INTERRUPTED` and schedule the reconnect as now. `DOWNLOAD_INTERRUPTED` records the files already acknowledged in this download in `finishedFiles` and keeps the download visible.
- The next engine is created with `{ resumeFrom: resumePointRef.current }`; the ref is cleared once handed over.
- If a PIN is asked for while resuming, the hook submits the PIN already entered (`state.pin`). If refused, the normal PIN prompt shows; the resume point waits for the manifest.
- Reconnecting giving up (`CONNECT_FAILED`), a cancel or a reset aborts a held resume point's writer.
- `onResumeFailed`: dispatch `RESUME_FAILED`. The session is connected with the list; `IncomingFilesCard` starts with the files in `finishedFiles` unticked and the rest ticked, under a `Notice` "Download was interrupted". This initial exclusion applies only after an interruption, so a normal completion does not untick everything.
- `TransferSummary` shows "Reconnecting…" while a download is interrupted, with its progress kept.
- Wake lock and sound effects: the run stays "running" across the gap; it ends on completion, failure or giving up.

## Sender room (`hooks/senderRoom.ts`, `hooks/senderState.ts`)

- Sender engine `onConnectionLost` → dispatch `RECEIVER_INTERRUPTED {peerId, atMs}` (new `interrupted` stage; records the acknowledged files in `finishedFiles`), end the engine but keep the slot: `busy` keeps the entry, recorded as a reservation for the receiver's `sessionId` with a 60 s timer.
- `resumeSession` (the same tab back on a new connection) moves the reservation to the new peer id; the timer keeps running.
- `startDownload` uses a reservation held by that peer at once (no line), clearing the timer.
- Timer expiry: release the slot, dispatch `RECEIVER_FAILED` "Connection lost", then `fillSlots`.
- A receiver waiting in line when the connection dropped is removed from the line as now and rejoins at the back.
- `teardown`, `stop`, `stopAll` and `endShare` clear reservations and their timers.
- `ReceiverRow`: the `interrupted` stage shows a yellow `StatusDot` and "Reconnecting…", keeping the progress shown.

## Error handling

- Invalid `fromChunk` (too large, on a later file, not an integer): fatal `ERROR`, as for any malformed peer message.
- A mismatched CRC after resuming is reported like any corrupted file.
- The sender's file becoming unreadable while seeding the CRC fails with the existing `readSlice` message.
- A resume that cannot proceed never fails the session: it falls back to the list (`RESUME_FAILED`).

## Testing

Unit (`src/test/`):

- `transfer.test.ts` (real engines over `MockDataConnection`, fake storage): drop a connection mid-file, connect a new pair with `resumeFrom`, check the written bytes equal the source and `isVerified`; a changed id or size → `onResumeFailed` and the writer aborted; resumed file not first in order → fallback; `fromChunk` beyond the chunk count or on a later file → failure; the prefix-seeded CRC matches a full read; metrics continue from `startBytes`.
- Protocol parsing of `fromChunk`.
- `metrics` with `startBytes` (percent continues; speed and elapsed ignore the prefix).
- `senderState` / `SenderRoom`: interrupted stage, reservation moved by `RECEIVER_RESUMED`, used by the next download, expiry releases the slot and fails the row, cleared on stop.
- `receiverState` / `useReceiverSession` with fake services: interruption keeps the download and finished files, resume point handed to the next engine, PIN auto-submitted, `RESUME_FAILED` gives the list with unfinished files ticked, giving up aborts the writer.

End to end (Playwright):

- Sender reload in the middle of a download. Files added through the hidden input have no handles, so this covers the fallback: the receiver reconnects and shows the list with the unfinished files ticked and the notice.
- The resume path itself is covered by unit tests plus a manual check in Chrome (sender reload with restored handles). DevTools offline mode does not cut WebRTC, so a network drop is not practical to fake in e2e.

## Documentation

Update `CLAUDE.md`: the "A download cut off midway starts again from the beginning" sentence, `FILE_START {fromChunk}` in the protocol flow, the `interrupted` stage and slot reservation in the sender room description, and the resume point in the receiver session.
