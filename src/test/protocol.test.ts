import { describe, it, expect } from 'vitest';
import { CHUNK_HEADER_SIZE, decodeChunk, encodeChunk, parseControlMessage } from '../services/transfer/protocol';

const manifest = {
  totalBytes: 3,
  files: [{ id: 'f1', name: 'a.txt', size: 3, type: 'text/plain', relativePath: 'dir/a.txt', lastModified: 1 }],
};

describe('parseControlMessage', () => {
  it('accepts a file selection only as increasing, unique file indices', () => {
    const parse = (fileIndices: unknown) =>
      parseControlMessage(JSON.stringify({ type: 'FILE_SELECTION', payload: { fileIndices } }));

    expect(parse([0, 2, 5])).toEqual({ type: 'FILE_SELECTION', payload: { fileIndices: [0, 2, 5] } });
    expect(parse([])).toBeNull();
    expect(parse([2, 1])).toBeNull();
    expect(parse([1, 1])).toBeNull();
    expect(parse([-1])).toBeNull();
    expect(parse('0,1')).toBeNull();
  });

  it.each([
    [{ type: 'HELLO', payload: { shareKey: 'abc_DEF-123' } }],
    [{ type: 'HELLO', payload: { shareKey: null } }],
    [{ type: 'AUTH_REQUEST', payload: { attemptsLeft: 3, isIncorrect: false } }],
    [{ type: 'AUTH_RESPONSE', payload: { pin: '1234' } }],
    [{ type: 'MANIFEST', payload: manifest }],
    [{ type: 'FILE_START', payload: { fileIndex: 0 } }],
    [{ type: 'FILE_COMPLETE', payload: { fileIndex: 0, checksum: 'deadbeef' } }],
    [{ type: 'FILE_ACK', payload: { fileIndex: 2, isVerified: true } }],
    [{ type: 'TRANSFER_PAUSE' }],
    [{ type: 'TRANSFER_RESUME' }],
    [{ type: 'TRANSFER_CANCEL' }],
    [{ type: 'ERROR', payload: { message: 'Disk full' } }],
    [{ type: 'QUEUED', payload: { position: 2 } }],
  ])('accepts a well-formed %o', (message) => {
    expect(parseControlMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    ['not JSON', '{nope'],
    ['an unknown type', JSON.stringify({ type: 'HELLO' })],
    ['a non-object', JSON.stringify(42)],
    ['a negative file index', JSON.stringify({ type: 'FILE_START', payload: { fileIndex: -1 } })],
    ['a fractional file index', JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 1.5 } })],
    ['a missing checksum', JSON.stringify({ type: 'FILE_COMPLETE', payload: { fileIndex: 0 } })],
    ['a non-string PIN', JSON.stringify({ type: 'AUTH_RESPONSE', payload: { pin: 1234 } })],
    ['a manifest without a file list', JSON.stringify({ type: 'MANIFEST', payload: { totalBytes: 0 } })],
    [
      'a manifest file with a negative size',
      JSON.stringify({ type: 'MANIFEST', payload: { totalBytes: 0, files: [{ id: 'f', name: 'a', size: -1, type: '' }] } }),
    ],
    [
      'a manifest whose total does not match its files',
      JSON.stringify({ type: 'MANIFEST', payload: { ...manifest, totalBytes: 999 } }),
    ],
    ['an error without a message', JSON.stringify({ type: 'ERROR', payload: {} })],
    ['a place in line below 1', JSON.stringify({ type: 'QUEUED', payload: { position: 0 } })],
    ['a greeting with a non-string key', JSON.stringify({ type: 'HELLO', payload: { shareKey: 42 } })],
  ])('rejects %s', (_label, raw) => {
    expect(parseControlMessage(raw)).toBeNull();
  });

  it('drops fields it does not know about', () => {
    const parsed = parseControlMessage(JSON.stringify({ type: 'FILE_START', payload: { fileIndex: 1, extra: 'x' } }));

    expect(parsed).toEqual({ type: 'FILE_START', payload: { fileIndex: 1 } });
  });
});

describe('chunk framing', () => {
  it('round-trips the file index, chunk index and payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);

    const decoded = decodeChunk(encodeChunk(7, 123456789, payload));

    expect(decoded.fileIndex).toBe(7);
    expect(decoded.chunkIndex).toBe(123456789);
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects a chunk shorter than its header', () => {
    expect(() => decodeChunk(new ArrayBuffer(CHUNK_HEADER_SIZE - 1))).toThrow(/malformed/i);
  });

  it('rejects a chunk whose declared length exceeds the data', () => {
    const packet = new Uint8Array(encodeChunk(0, 0, new Uint8Array(4)));
    new DataView(packet.buffer).setUint32(12, 100, false);

    expect(() => decodeChunk(packet.buffer)).toThrow(/malformed/i);
  });
});
