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

- **`services/webrtc.ts` (`WebRtcService`)**: one instance per signalling session. It is either a sender's room (`initSender`, which generates the room code) or a receiver's connection (`initReceiver`). Handlers are passed to the constructor. A sender's room announces every receiver; how many may stay is decided by the session (`SenderRoom`). `disconnectPeer(peerId?)` closes one receiver (or all) with `{ flush: true }` so a final `TRANSFER_CANCEL`/`ERROR`/`FILE_ACK` is still delivered.
- **`services/transfer/`**: the transfer protocol, one instance per connection. `TransferSender` (`start(files, pin)`) and `TransferReceiver` (`startReceiving()`, `submitPin()`) extend `TransferPeer` (`peer.ts`), which owns the ordered message queue, pause/cancel/error handling, disconnect detection and completion. `protocol.ts` has the typed `ControlMessage` validation (`parseControlMessage` — unknown or malformed peer messages fail the transfer) and chunk framing; `metrics.ts` throttles progress snapshots. They report to the UI only through `TransferEvents` / `ReceiverEvents` (`types/transfer.ts`) and never touch the DOM: wake lock and sounds run via `services/transferEffects.ts`, the tab title via `hooks/useProgressTitle.ts`.
- **`services/storage.ts`**: `StorageWriter` implementations: save-file picker, folder picker (`DirectoryWriter`, which recreates sanitized relative paths) and an in-memory fallback. `chooseWriterFactory()` must run inside the user's click, because browsers reject file pickers without a user gesture. The receiver therefore picks the destination once in `startReceiving()`, and every later file reuses that factory.
- **`hooks/useSenderSession.ts` / `hooks/useReceiverSession.ts`**: each flow is a `useReducer` state machine. The receiver keeps its connection and engine in refs. The sender's reducer (`hooks/senderState.ts`) tracks `receivers` (one `SenderReceiver` per person: queued, choosing, transferring, completed, failed) and `pendingPeers`; `selectFocusReceiver` / `selectSenderStatus` derive the one-person full-screen view. Connections, the line and one `TransferSender` per downloader live in `SenderRoom` (`hooks/senderRoom.ts`, a plain class that only reports through `dispatch`); the hook pushes files and options into it from an effect (`room.configure`), which re-offers files, admits held receivers and fills free slots. `SenderView` takes the whole session (`{ state, status, focus, actions }`). Engine callbacks are wrapped in `ifCurrent(...)` so events from a torn-down or replaced engine are ignored. Services come from `hooks/sessionServices.ts` and are injectable; tests pass fakes from `src/test/utils/fakeSessionServices.ts`.
- **`App.tsx`**: composition only (theme, settings, send/receive mode, the two session hooks). There is deliberately no header, footer or logo: the page is the current view plus a corner settings button (the brand shows in the tab title and Settings → About). Theme choice, GitHub link and build stamp live in `SettingsModal`. Send is the landing view; receiving by code is a link from it (and back). Files can be dropped or pasted anywhere (`hooks/usePageFileDrop.ts`, which always blocks the browser from opening a dropped file); dropped folders are walked via the entries API (`utils/droppedFiles.ts`). Views in `components/` are presentational.

### Transfer protocol

Control messages are JSON strings; data chunks are binary with a 16-byte big-endian header: `u32 fileIndex | u64 chunkIndex | u32 payloadLength`, then a 64 KB payload.

Admission: the receiver's first message is always `HELLO {shareKey, device?, timeZone?}`. `device` ("Chrome on Android") and `timeZone` come from `utils/deviceInfo.ts` and only label the receiver on the sender's side, next to its IP (read from the selected ICE candidate pair by `services/peerAddress.ts`; relayed and mDNS addresses are not shown) and a place derived from the time zone. No lookup service is used; malformed details are dropped, not fatal. `WebRtcService` waits for it (3 s timeout → no key) before announcing the connection with `onIncomingConnection(conn, { shareKey })`. Each sender room has a random 128-bit key (`utils/shareLink.ts`) carried in the link's fragment (`?room=DW-XXXXXX#key=…`, never sent to servers). Sending is one page: the file list (`FileQueue`, with File/Folder pickers) and a Share button that creates the link (`isShared`) with the default options, without copying it. Nobody is admitted before that. The link and who is using it (`LinkSection`) then appear below the files, with a one-line summary of its settings; the options themselves are in a dialog (`SharingSettings`). A finished transfer stays on the transfer screen (`MetricsDashboard` with `completion`) at 100%, with each file's time (`TransferMetrics.fileSeconds`). Afterwards a matching key is admitted without asking (unless approval is required); no key or a wrong key gets the Accept prompt. By default a link is for one person: one receiver at a time (others are turned away with an `ERROR` saying why), and after one completed download it stops admitting anyone; the completion screen offers "Send to someone else" (`stopSharing()`: same files, fresh room and key). With "Allow simultaneous downloads" set above 1 (one −/+ control: 1 is the one-person link, 2–10 sets `options.allowMultiple` and `maxSimultaneous`, remembered in `localStorage` via `utils/sharingMemory.ts`) receivers hold a slot while choosing or downloading; later arrivals wait in line and get `QUEUED {position}` updates until a slot frees. Three PIN lockouts rotate the room when nobody else is connected, otherwise they switch on approval (`LOCKED_DOWN`) so other downloads are not cut off. Settings apply as they are toggled (a typed PIN on blur or Enter, never half-typed): a stricter change (PIN, approval, fewer at once, back to one person) with someone connected asks whether it applies to new connections only or also stops everyone connected, including the line (`updateSharing(options, 'new' | 'now')`). Clearing the files after sharing starts over with a fresh room and key, so earlier recipients cannot join the next batch. The receiver auto-connects when opened with a key (starting in `connecting`, so the code form never flashes), strips it from the address bar, and only presents it to the room it was shared for. It reconnects when the sender goes away before saving starts, but not after it has left (done, failed, cancelled or turned away). The room code and key persist in `sessionStorage` (`utils/roomMemory.ts`) so a sender reload keeps shared links working.

Flow: sender admits the peer, then `TransferSender.start(files, pin)`. If there's a PIN, the sender sends `AUTH_REQUEST` and waits for `AUTH_RESPONSE` (3 attempts); after that comes `MANIFEST`. The receiver then calls `startReceiving(fileIndices?)`; if the user ticked only some files it first sends `FILE_SELECTION {fileIndices}` (strictly increasing; the sender sizes the transfer to it and completes after the last selected file), then `FILE_START`. Metrics count positions within the selection, not manifest indices. For each file: chunks, then `FILE_COMPLETE {checksum}` (CRC-32), then `FILE_ACK {isVerified}`, then the next `FILE_START`. The last ack fires `onAllCompleted({ corruptedFiles })` on both sides.

Invariants that tests rely on:
- Incoming messages go through a single serialized promise queue, so disk writes never overlap. The `FILE_START` handler must **not** await the file stream, or pause/cancel messages would be blocked.
- The sender only honours `FILE_START` after it has sent the manifest (the PIN gate).
- Until the first `FILE_START` (sender status `awaiting_receiver`), `updateFiles()` re-sends `MANIFEST` so the receiver's list stays live; afterwards the list is frozen. A receiver whose manifest changed while its save picker was open aborts `startReceiving()` and asks again. A receiver leaving before its first `FILE_START` returns the sender to `waiting` without an error.
- The receiver validates each chunk's file index, sequence and size against the manifest *before* checksumming or writing it.
- `TRANSFER_CANCEL` from the peer stops locally without echoing it back. Local fatal errors go through `failTransfer()`, which sends `ERROR` to the peer.
- A connection closing while a transfer is active surfaces as `onError`. After a stop, late messages are ignored.

### Per-domain branding

One build serves two brands. `dropto.space` / `www.dropto.space` gets dropto (orange, `DT-` room codes); any other host gets DropWave (indigo, `DW-`).
- The inline boot script in `index.html` is the only brand detector. It runs before first paint, sets `data-brand` on `<html>`, and swaps the title, theme-color, favicon and manifest. `getActiveBrand()` in `src/branding.ts` reads `data-brand`.
- Brand strings and asset paths are duplicated between `index.html` and `src/branding.ts`. `src/test/branding.test.ts` executes the real boot script to keep them in sync.
- In dev only, `?brand=dropto` overrides detection (it uses Vite's `%MODE%` HTML replacement).
- Tailwind 4 (via `@tailwindcss/vite`; no config file). Stylesheets: `src/index.css` only imports `src/styles/` — `tokens.css` (colour tokens and themes), `base.css` (element defaults: cursors, focus ring, selection, scrollbars) and `scroll-fade.css` (the `scroll-fade` class: edge fades on scroll areas via scroll-state container queries). All colours are CSS-variable tokens in `tokens.css`: `@theme` holds the light theme and indigo brand, `.dark` overrides the theme (and lightens DropWave's indigo one step), `:root[data-brand='dropto']` overrides the brand with orange. Filled controls use `bg-accent` / `hover:bg-accent-hover` with `text-text-on-accent`, which `contrast-color()` picks (white on indigo, black on orange; per-brand fallback without support). Use token classes (`bg-surface-1`, `text-text-4`, `brand-500`, …) rather than raw colours or `dark:` variants.
- **If you edit the inline script in `index.html`, update its `sha256-` hash in the `vercel.json` CSP** (it's currently Report-Only). `src/test/csp.test.ts` fails until you do.

## Conventions

- TypeScript is `strict` with `erasableSyntaxOnly`: no enums, no constructor parameter properties.
- `if`/loop bodies always use braces, with the closing brace on its own line (oxlint `curly` is an error).
- UI primitives live in `components/ui/` (Button, Card, StatusCard, Modal, IconBadge, IconButton, Notice, TextInput, ProgressBar, SegmentedControl, LinkButton, NumberStepper, Screen, …; see the marpe-conventions skill), with `utils/cn.ts` (clsx + tailwind-merge; later classes override earlier ones). Themes: `hooks/useTheme.ts` — System (follows the OS live), Light or Dark; System stores nothing so the pre-paint script in `index.html` follows the OS.
- Unit tests live in `src/test/` (not colocated). Protocol tests (`transfer.test.ts`) connect a real `TransferSender` and `TransferReceiver` through the in-file `MockDataConnection`, injecting fake storage via `ReceiverOptions.chooseStorage`. `src/test/utils/mockFileSystem.ts` fakes File System Access directory handles; call `clearFilePickers()` after tests that install picker mocks.
