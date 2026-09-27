# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DropWave / dropto.space: a static, browser-only React 19 + TypeScript + Vite app for peer-to-peer file transfer over WebRTC DataChannels (PeerJS for signalling, public `0.peerjs.com` by default). No backend; deployed to Vercel as a SPA/PWA. Designed for multi-GB files: chunks stream to disk via the File System Access API on Chromium, and fall back to in-memory buffering elsewhere.

## Commands

```bash
npm run dev          # Vite dev server on :5173
npm run build        # tsc -b (strict) + vite build
npm run lint         # oxlint --deny-warnings (any warning fails)
npm test             # vitest run (jsdom), all unit tests
npm run test:e2e     # Playwright (Chromium); starts/reuses the dev server
```

- Single unit test file / test: `npx vitest run src/test/transfer.test.ts -t "PIN"`
- Single e2e test: `npx playwright test -g "PIN-protected"`
- CI (`.github/workflows/ci.yml`) runs lint, unit tests and build, plus an e2e job. Playwright starts Vite and a local PeerServer (`npx peerjs --port 9000`, the `peer` dev dependency); `e2e/fixtures.ts` stores settings pointing every test browser at it, so e2e needs no internet. Import `test`/`expect` from `./fixtures`, and create extra browser contexts with `newLocalContext()`.
- Node `^20.19.0 || >=22.12.0`.

## Architecture

Layers, from the network up:

- **`services/webrtc.ts` (`WebRtcService`)**: one instance per signalling session. It is either a sender's room (`initSender`, which generates the room code) or a receiver's connection (`initReceiver`). Handlers are passed to the constructor. Only one receiver may hold a sender's room at a time; later connections are closed. `disconnectPeer()` closes with `{ flush: true }` so a final `TRANSFER_CANCEL`/`ERROR`/`FILE_ACK` is still delivered.
- **`services/transfer/`**: the transfer protocol, one instance per connection. `TransferSender` (`start(files, pin)`) and `TransferReceiver` (`startReceiving()`, `submitPin()`) extend `TransferPeer` (`peer.ts`), which owns the ordered message queue, pause/cancel/error handling, disconnect detection and completion. `protocol.ts` has the typed `ControlMessage` validation (`parseControlMessage` — unknown or malformed peer messages fail the transfer) and chunk framing; `metrics.ts` throttles progress snapshots. They report to the UI only through `TransferEvents` / `ReceiverEvents` (`types/transfer.ts`) and never touch the DOM: wake lock and sounds run via `services/transferEffects.ts`, the tab title via `hooks/useProgressTitle.ts`.
- **`services/storage.ts`**: `StorageWriter` implementations: save-file picker, folder picker (`DirectoryWriter`, which recreates sanitized relative paths) and an in-memory fallback. `chooseWriterFactory()` must run inside the user's click, because browsers reject file pickers without a user gesture. The receiver therefore picks the destination once in `startReceiving()`, and every later file reuses that factory.
- **`hooks/useSenderSession.ts` / `hooks/useReceiverSession.ts`**: each flow is a `useReducer` state machine (`SenderStatus` / `ReceiverStatus` in `types/transfer.ts`). The live connection and engine are kept in refs. Engine callbacks are wrapped in `ifCurrent(...)` so events from a torn-down or replaced engine are ignored. Services come from `hooks/sessionServices.ts` and are injectable; tests pass fakes from `src/test/utils/fakeSessionServices.ts`.
- **`App.tsx`**: composition only (theme, settings, send/receive mode, the two session hooks). There is deliberately no header, footer or logo: the page is the current view plus a corner settings button (the brand shows in the tab title and Settings → About). Theme choice, GitHub link and build stamp live in `SettingsModal`. Send is the landing view; receiving by code is a link from it (and back). Files can be dropped or pasted anywhere (`hooks/usePageFileDrop.ts`, which always blocks the browser from opening a dropped file); dropped folders are walked via the entries API (`utils/droppedFiles.ts`). Views in `components/` are presentational.

### Transfer protocol

Control messages are JSON strings; data chunks are binary with a 16-byte big-endian header: `u32 fileIndex | u64 chunkIndex | u32 payloadLength`, then a 64 KB payload.

Admission: the receiver's first message is always `HELLO {shareKey}`. `WebRtcService` waits for it (3 s timeout → no key) before announcing the connection with `onIncomingConnection(conn, { shareKey })`. Each sender room has a random 128-bit key (`utils/shareLink.ts`) carried in the link's fragment (`?room=DW-XXXXXX#key=…`, never sent to servers). A matching key is admitted without asking, or held until files are queued; no key or a wrong key gets the Accept prompt. The receiver auto-connects when opened with a key, strips it from the address bar, and only presents it to the room it was shared for. The room code and key persist in `sessionStorage` (`utils/roomMemory.ts`) so a sender reload keeps shared links working.

Flow: sender admits the peer, then `TransferSender.start(files, pin)`. If there's a PIN, the sender sends `AUTH_REQUEST` and waits for `AUTH_RESPONSE` (3 attempts); after that comes `MANIFEST`. The receiver then calls `startReceiving(fileIndices?)`; if the user ticked only some files it first sends `FILE_SELECTION {fileIndices}` (strictly increasing; the sender sizes the transfer to it and completes after the last selected file), then `FILE_START`. Metrics count positions within the selection, not manifest indices. For each file: chunks, then `FILE_COMPLETE {checksum}` (CRC-32), then `FILE_ACK {isVerified}`, then the next `FILE_START`. The last ack fires `onAllCompleted({ corruptedFiles })` on both sides.

Invariants that tests rely on:
- Incoming messages go through a single serialized promise queue, so disk writes never overlap. The `FILE_START` handler must **not** await the file stream, or pause/cancel messages would be blocked.
- The sender only honours `FILE_START` after it has sent the manifest (the PIN gate).
- Until the first `FILE_START` (sender status `awaiting_receiver`), `updateFiles()` re-sends `MANIFEST` so the receiver's list stays live; afterwards the list is frozen. A receiver whose manifest changed while its save picker was open aborts `startReceiving()` and asks again. A receiver leaving before its first `FILE_START` returns the sender to `waiting` without an error.
- The receiver validates each chunk's file index, sequence and size against the manifest *before* checksumming or writing it.
- `TRANSFER_CANCEL` from the peer stops locally without echoing it back. Local fatal errors go through `failTransfer()`, which sends `ERROR` to the peer.
- A connection closing while a transfer is active surfaces as `onError`. After a stop, late messages are ignored.

### Per-domain branding

One build serves two brands. `dropto.space` / `www.dropto.space` gets dropto (orange, `DT-` room codes); any other host gets DropWave (green, `DW-`).
- The inline boot script in `index.html` is the only brand detector. It runs before first paint, sets `data-brand` on `<html>`, and swaps the title, theme-color, favicon and manifest. `getActiveBrand()` in `src/branding.ts` reads `data-brand`.
- Brand strings and asset paths are duplicated between `index.html` and `src/branding.ts`. `src/test/branding.test.ts` executes the real boot script to keep them in sync.
- In dev only, `?brand=dropto` overrides detection (it uses Vite's `%MODE%` HTML replacement).
- Tailwind `brand-*` colours are `rgb(var(--brand-N) / <alpha-value>)`. The palettes live in `src/index.css` (`:root` for green, `:root[data-brand='dropto']` for orange). Use `brand-*` / `supabase-*` tokens, not hex classes.
- **If you edit the inline script in `index.html`, update its `sha256-` hash in the `vercel.json` CSP** (it's currently Report-Only). `src/test/csp.test.ts` fails until you do.

## Conventions

- TypeScript is `strict` with `erasableSyntaxOnly`: no enums, no constructor parameter properties.
- `if`/loop bodies always use braces, with the closing brace on its own line (oxlint `curly` is an error).
- UI primitives live in `components/ui/` (Button, Card, StatusCard, Modal, IconBadge, IconButton, Notice, TextInput, ProgressBar, SegmentedControl, LinkButton, …; see the marpe-conventions skill), with `utils/cn.ts` (clsx + tailwind-merge; later classes override earlier ones). Themes: `hooks/useTheme.ts` — System (follows the OS live), Light or Dark; System stores nothing so the pre-paint script in `index.html` follows the OS.
- Unit tests live in `src/test/` (not colocated). Protocol tests (`transfer.test.ts`) connect a real `TransferSender` and `TransferReceiver` through the in-file `MockDataConnection`, injecting fake storage via `ReceiverOptions.chooseStorage`. `src/test/utils/mockFileSystem.ts` fakes File System Access directory handles; call `clearFilePickers()` after tests that install picker mocks.
