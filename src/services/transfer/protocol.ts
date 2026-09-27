import type { ControlMessage, ManifestFile, TransferManifest } from '../../types/transfer';

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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isByteCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
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
    case 'HELLO':
      return typeof payload.shareKey === 'string' || payload.shareKey === null
        ? { type: 'HELLO', payload: { shareKey: payload.shareKey } }
        : null;
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
    default:
      return null;
  }
}
