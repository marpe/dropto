import type { DataConnection } from 'peerjs';
import type { ControlMessage, HelloPayload, ManifestFile, TransferManifest } from '../../types/transfer';

export const CHUNK_SIZE = 64 * 1024;
/** u32 fileIndex | u64 chunkIndex | u32 payloadLength, big-endian */
export const CHUNK_HEADER_SIZE = 16;

export interface DecodedChunk {
  fileIndex: number;
  chunkIndex: number;
  payload: Uint8Array;
}

export function encodeChunk(fileIndex: number, chunkIndex: number, payload: Uint8Array): ArrayBuffer {
  const packet = new Uint8Array(CHUNK_HEADER_SIZE + payload.length);
  const view = new DataView(packet.buffer);
  view.setUint32(0, fileIndex, false);
  view.setBigUint64(4, BigInt(chunkIndex), false);
  view.setUint32(12, payload.length, false);
  packet.set(payload, CHUNK_HEADER_SIZE);
  return packet.buffer;
}

export function decodeChunk(buffer: ArrayBuffer): DecodedChunk {
  if (buffer.byteLength < CHUNK_HEADER_SIZE) {
    throw new Error('Received a malformed data chunk');
  }
  const view = new DataView(buffer);
  const payloadLength = view.getUint32(12, false);
  if (CHUNK_HEADER_SIZE + payloadLength > buffer.byteLength) {
    throw new Error('Received a malformed data chunk');
  }
  return {
    fileIndex: view.getUint32(0, false),
    chunkIndex: Number(view.getBigUint64(4, false)),
    payload: new Uint8Array(buffer, CHUNK_HEADER_SIZE, payloadLength),
  };
}

/** Normalises whatever binary shape PeerJS delivers into an ArrayBuffer, or null for non-binary data. */
export async function toArrayBuffer(data: unknown): Promise<ArrayBuffer | null> {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data.arrayBuffer();
  }
  return null;
}

/** Control messages travel as JSON strings, which keeps them apart from binary chunks. */
export function sendControlMessage(conn: DataConnection, message: ControlMessage) {
  if (conn.open) {
    conn.send(JSON.stringify(message));
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/** Non-empty, strictly increasing file indices: the order files are transferred in. */
function isSelection(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((index, position) => isIndex(index) && (position === 0 || index > value[position - 1]))
  );
}

function isByteCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

// Display-only details from the peer: short, plain and optional, so a bad value is dropped rather than fatal
const DEVICE_PATTERN = /^[\p{L}\p{N} .-]{1,60}$/u;
const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
// Model names like "Pixel 8 Pro" or "SM-S918B"; anything else is not shown
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,39}$/;

function parseHello(payload: UnknownRecord): HelloPayload | null {
  if (typeof payload.shareKey !== 'string' && payload.shareKey !== null) {
    return null;
  }
  const hello: HelloPayload = { shareKey: payload.shareKey };
  if (typeof payload.device === 'string' && DEVICE_PATTERN.test(payload.device)) {
    hello.device = payload.device;
  }
  if (typeof payload.timeZone === 'string' && payload.timeZone.length <= 64 && TIME_ZONE_PATTERN.test(payload.timeZone)) {
    hello.timeZone = payload.timeZone;
  }
  if (typeof payload.sessionId === 'string' && SESSION_ID_PATTERN.test(payload.sessionId)) {
    hello.sessionId = payload.sessionId;
  }
  if (payload.formFactor === 'phone' || payload.formFactor === 'tablet' || payload.formFactor === 'desktop') {
    hello.formFactor = payload.formFactor;
  }
  if (typeof payload.model === 'string' && MODEL_PATTERN.test(payload.model)) {
    hello.model = payload.model;
  }
  if (payload.storage === 'disk' || payload.storage === 'memory') {
    hello.storage = payload.storage;
  }
  return hello;
}

function parseManifestFile(value: unknown): ManifestFile | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, name, size, type, relativePath, lastModified } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || !isByteCount(size) || typeof type !== 'string') {
    return null;
  }
  if (relativePath !== undefined && typeof relativePath !== 'string') {
    return null;
  }
  if (lastModified !== undefined && typeof lastModified !== 'number') {
    return null;
  }
  return { id, name, size, type, relativePath, lastModified };
}

function parseManifest(value: unknown): TransferManifest | null {
  if (!isRecord(value) || !Array.isArray(value.files) || !isByteCount(value.totalBytes)) {
    return null;
  }
  const files = value.files.map(parseManifestFile);
  if (files.some((file) => file === null)) {
    return null;
  }
  const validFiles = files as ManifestFile[];
  const declaredTotal = validFiles.reduce((sum, file) => sum + file.size, 0);
  // A mismatched total would make progress and completion accounting lie
  if (declaredTotal !== value.totalBytes) {
    return null;
  }
  return { totalBytes: value.totalBytes, files: validFiles };
}

/**
 * Parses and validates a control message from the peer. Returns null for anything malformed or
 * unknown, and copies only known fields so unexpected peer data never reaches the app.
 */
export function parseControlMessage(raw: string): ControlMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(message)) {
    return null;
  }
  const payload = isRecord(message.payload) ? message.payload : {};

  switch (message.type) {
    case 'HELLO': {
      const hello = parseHello(payload);
      return hello ? { type: 'HELLO', payload: hello } : null;
    }
    case 'AUTH_REQUEST':
      return isIndex(payload.attemptsLeft) && typeof payload.isIncorrect === 'boolean'
        ? { type: 'AUTH_REQUEST', payload: { attemptsLeft: payload.attemptsLeft, isIncorrect: payload.isIncorrect } }
        : null;
    case 'AUTH_RESPONSE':
      return typeof payload.pin === 'string' ? { type: 'AUTH_RESPONSE', payload: { pin: payload.pin } } : null;
    case 'MANIFEST': {
      const manifest = parseManifest(message.payload);
      return manifest ? { type: 'MANIFEST', payload: manifest } : null;
    }
    case 'FILE_SELECTION':
      return isSelection(payload.fileIndices)
        ? { type: 'FILE_SELECTION', payload: { fileIndices: [...payload.fileIndices] } }
        : null;
    case 'FILE_START':
      return isIndex(payload.fileIndex) ? { type: 'FILE_START', payload: { fileIndex: payload.fileIndex } } : null;
    case 'FILE_COMPLETE':
      return isIndex(payload.fileIndex) && typeof payload.checksum === 'string'
        ? { type: 'FILE_COMPLETE', payload: { fileIndex: payload.fileIndex, checksum: payload.checksum } }
        : null;
    case 'FILE_ACK':
      return isIndex(payload.fileIndex) && typeof payload.isVerified === 'boolean'
        ? { type: 'FILE_ACK', payload: { fileIndex: payload.fileIndex, isVerified: payload.isVerified } }
        : null;
    case 'TRANSFER_PAUSE':
    case 'TRANSFER_RESUME':
    case 'TRANSFER_CANCEL':
      return { type: message.type };
    case 'ERROR':
      return typeof payload.message === 'string' ? { type: 'ERROR', payload: { message: payload.message } } : null;
    case 'QUEUED':
      return isIndex(payload.position) && payload.position >= 1
        ? { type: 'QUEUED', payload: { position: payload.position } }
        : null;
    default:
      return null;
  }
}
