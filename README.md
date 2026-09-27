# DropWave 🌊 — 10GB Browser-to-Browser WebRTC File Transfer

> A high-performance, zero-backend, browser-only web application to send files up to and exceeding **10 GB** directly between devices using WebRTC DataChannels.

![DropWave License](https://img.shields.io/badge/license-MIT-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-DTLS%20Encrypted-green.svg)
![Zero Cloud](https://img.shields.io/badge/Cloud%20Storage-0%20Bytes-orange.svg)

---

## ⚡ The 10GB Problem & How DropWave Solves It

Standard web apps fail when transferring files larger than 1–2 GB in a browser because JavaScript tries to buffer the entire file into RAM (`Blob` / `ArrayBuffer`), triggering an immediate **Out-Of-Memory (OOM) tab crash**.

**DropWave** overcomes this with a streaming architecture:
1. **Zero-RAM Disk Streaming**: Uses the **File System Access API** (`showSaveFilePicker` -> `createWritable`) on Chromium browsers (Chrome, Edge, Brave, Opera). Incoming 64 KB SCTP chunks write directly to disk as they arrive, keeping memory usage **under 50 MB** even when streaming a 100 GB file.
2. **Active Backpressure Flow Control**: Monitors `RTCDataChannel.bufferedAmount`. When the buffer exceeds 1 MB (`HIGH_WATERMARK`), file slicing pauses and only resumes when the buffer drains below 256 KB (`onbufferedamountlow`), preventing packet drops and tab freezes.
3. **Chunk-Indexed Protocol**: 64 KB slices indexed with 64-bit sequence numbers.
4. **Streaming Checksum Verification**: Computes incremental IEEE 802.3 CRC-32 on the fly on both sender and receiver to verify end-to-end data integrity without CPU bottlenecks.
5. **Screen Wake Lock API**: Prevents the device from sleeping or throttling background tabs during long multi-gigabyte transfers.

---

## ✨ Features

- 🚀 **Files up to 10GB+**: Tested for multi-gigabyte files with constant, minimal memory consumption.
- 🔒 **Direct P2P & DTLS Encrypted**: Files travel straight from device to device. Zero intermediate servers, zero uploads, zero cloud storage.
- 📱 **QR Code Mobile Pairing**: Instant camera scan from phone to connect PC and mobile devices.
- 🛡️ **Sender Connection Approval**: Sender explicitly reviews and accepts/declines incoming peer requests before any file metadata or chunks are sent.
- 🔑 **Optional Session PIN**: The receiver must enter the sender's PIN (up to 6 characters, 3 attempts) before any file names or data are shared.
- 📂 **Multi-File & Folder Queue**: Drag-and-drop multiple files or entire folder hierarchies with sequential transfers.
- 📊 **Real-time Transfer Dashboard**: Live speedometer (MB/s gauge), dynamic ETA calculator, per-file and total progress bars, and dynamic tab title percentage.
- 🔔 **Audio Chimes & Notifications**: Pleasant Web Audio synth chimes on peer connect and transfer completion (zero external media assets required).
- 🌐 **Zero Server Setup**: Uses free public PeerJS cloud signaling (`0.peerjs.com`) with shareable 6-digit codes (`DW-XXXXXX`) and URLs.
- ⚙️ **Enterprise Ready**: Built-in settings modal to configure custom signaling servers and private STUN/TURN relays for strict corporate NATs/firewalls.
- 🌙 **Dark & Light Mode**: Auto-detects system theme with instant toggle and zero flash of unstyled content (FOUC).
- 📦 **Installable PWA**: Offline asset caching and installable app icon for desktop and mobile.

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
The output will be generated in `dist/`. Since DropWave is 100% static, you can deploy the `dist/` directory directly to GitHub Pages, Cloudflare Pages, Vercel, or Netlify.

---

## 🎨 Per-Domain Branding

One build serves two brands, picked from the hostname:

| Domain | Name | Accent | Room codes |
| :--- | :--- | :--- | :--- |
| `dropto.space`, `www.dropto.space` | dropto.space | Orange `#F97316` | `DT-XXXXXX` |
| any other host | DropWave | Green `#3ECF8E` | `DW-XXXXXX` |

The boot script in `index.html` detects the brand before first paint and stamps `data-brand` on `<html>`; colours come from CSS variables in `src/index.css`, and names/assets from `src/branding.ts`. Room codes work across both domains. In development, append `?brand=dropto` to preview the other brand locally.

If you edit the inline boot script, regenerate its hash in the `vercel.json` CSP (`src/test/csp.test.ts` fails until you do).

---

## 🌐 Browser Compatibility

| Browser | Direct-to-Disk (Zero RAM) | Max Tested File Size |
| :--- | :---: | :---: |
| **Google Chrome** (v86+) | ✅ Native File System Access | 100 GB+ |
| **Microsoft Edge** (v86+) | ✅ Native File System Access | 100 GB+ |
| **Brave / Opera** | ✅ Native File System Access | 100 GB+ |
| **Mozilla Firefox** | ⚠️ Streaming Fallback | ~2–4 GB (Heap limit) |
| **Apple Safari / iOS** | ⚠️ Streaming Fallback | ~2–4 GB (Heap limit) |

> **Note for 10GB+ transfers**: We recommend using a Chromium-based browser (Chrome, Edge, Brave) on the receiving side for transfers over 4 GB to enable native zero-RAM streaming direct to disk.

---

## 📜 License

MIT License. Free for personal and commercial use.
