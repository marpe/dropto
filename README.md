# dropto.space — 10GB Browser-to-Browser WebRTC File Transfer

> A high-performance, zero-backend, browser-only web application to send files up to and exceeding **10 GB** directly between devices using WebRTC DataChannels.

![dropto.space License](https://img.shields.io/badge/license-MIT-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-DTLS%20Encrypted-green.svg)
![Zero Cloud](https://img.shields.io/badge/Cloud%20Storage-0%20Bytes-orange.svg)

---

## ⚡ The 10GB Problem & How dropto.space Solves It

Standard web apps fail when transferring files larger than 1–2 GB in a browser because JavaScript tries to buffer the entire file into RAM (`Blob` / `ArrayBuffer`), triggering an immediate **Out-Of-Memory (OOM) tab crash**.

**dropto.space** overcomes this with a streaming architecture:
1. **Zero-RAM Disk Streaming**: Uses the **File System Access API** (`showSaveFilePicker` -> `createWritable`) on Chromium browsers (Chrome, Edge, Brave, Opera). Incoming 64 KB chunks are written to disk as they arrive, so memory use stays flat however large the file.
2. **Active Backpressure Flow Control**: Monitors `RTCDataChannel.bufferedAmount`. When the buffer exceeds 1 MB (`HIGH_WATERMARK`), file slicing pauses and only resumes when the buffer drains below 256 KB (`onbufferedamountlow`), preventing packet drops and tab freezes.
3. **Chunk-Indexed Protocol**: 64 KB slices indexed with 64-bit sequence numbers.
4. **Streaming Checksum Verification**: Computes incremental IEEE 802.3 CRC-32 on the fly on both sender and receiver to verify end-to-end data integrity without CPU bottlenecks.
5. **Resumable Downloads**: If the connection drops mid-file, the receiver reconnects and carries on from the last chunk it wrote instead of starting over.
6. **Screen Wake Lock API**: Keeps the device awake during long transfers.

---

## ✨ Features

- 🚀 **Large Files**: On Chromium browsers downloads stream straight to disk; Firefox and Safari hold a download in memory until it is done, so very large files may not fit there.
- 🔒 **Direct & Encrypted**: Files travel device to device over DTLS-encrypted WebRTC. No uploads, no cloud storage. A signalling server (the public PeerJS one, `0.peerjs.com`, by default) only introduces the two browsers; a TURN relay, if you configure one, forwards the encrypted data when a direct route is impossible.
- 🔗 **Share by Link**: Copy link hands out `?room=DT-XXXXXX#key=…`. The random 128-bit key lives in the URL fragment, which browsers never send to a server; anyone with the link joins without asking, while someone with only the room code waits for you to accept.
- 👥 **Several People at Once**: Everyone with the link can browse and pick files at the same time; up to three download at once and the rest wait in line.
- ☑️ **Pick What to Download**: Receivers tick the files they want, and can come back for more or download again while connected.
- 📂 **Files & Folders**: Drop or paste files and whole folders anywhere on the page; folder structure is recreated on the receiving side.
- ♻️ **Survives a Reload**: The sender's link and file list persist across a reload; on Chromium the files themselves come back too.
- ✅ **Integrity Check**: Every file is verified end to end with CRC-32.
- 📊 **Live Progress**: Per-person and per-file progress and speed, with the percentage in the tab title.
- 🔔 **Notifications & Chimes**: System notifications and optional Web Audio chimes when someone connects or a transfer finishes.
- ⚙️ **Custom Servers**: Settings for your own PeerJS signalling server and STUN/TURN relays for strict NATs and firewalls.
- 🌙 **Light & Dark**: Follows the system theme, or pick one, without a flash on load.
- 📦 **Installable PWA**: Install it as an app on desktop and mobile.

---

## 🛠️ Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start development server
```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### 3. Build for production
```bash
npm run build
```
The output will be generated in `dist/`. Since dropto.space is 100% static, you can deploy the `dist/` directory directly to GitHub Pages, Cloudflare Pages, Vercel, or Netlify.

---

## 🎨 Branding

The name, room-code prefix (`DT-`) and confetti palette live in `src/branding.ts`; the brand colour scale (Tailwind's blue) in `src/styles/tokens.css`; the static title, theme colour and favicon in `index.html`; the PWA manifest in `vite.config.ts`.

If you edit the inline theme script in `index.html`, regenerate its hash in the `vercel.json` CSP (`src/test/csp.test.ts` fails until you do).

---

## 🌐 Browser Compatibility

| Receiving browser | Where downloads go |
| :--- | :--- |
| **Chrome, Edge, Brave, Opera** (Chromium 86+) | ✅ Straight to disk (File System Access API) |
| **Mozilla Firefox** | ⚠️ Memory until the download finishes |
| **Apple Safari / iOS** | ⚠️ Memory until the download finishes |

> **Very large files**: receive them in a Chromium-based browser. Elsewhere the whole download has to fit in the tab's memory, which usually tops out at a few GB. The sender sees a "Saves to memory" warning next to such a receiver.

---

## 📜 License

[MIT](LICENSE)
