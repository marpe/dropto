import { describe, it, expect } from 'vitest';
import { FastStreamingChecksum } from '../services/checksum';

describe('FastStreamingChecksum', () => {
  it('computes expected CRC32 for known strings', () => {
    const calc = new FastStreamingChecksum();
    const encoder = new TextEncoder();
    calc.update(encoder.encode('The quick brown fox jumps over the lazy dog'));
    expect(calc.digest()).toBe('414fa339');
  });

  it('computes identical checksum when streamed in chunks vs single chunk', () => {
    const single = new FastStreamingChecksum();
    const streamed = new FastStreamingChecksum();

    const data = new Uint8Array(1024 * 128); // 128 KB
    for (let i = 0; i < data.length; i++) {
      data[i] = (i * 37) & 0xff;
    }

    single.update(data);

    // Stream in 16KB chunks
    const chunkSize = 16 * 1024;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      streamed.update(data.subarray(offset, offset + chunkSize));
    }

    expect(streamed.digest()).toBe(single.digest());
  });

  it('resets correctly between runs', () => {
    const calc = new FastStreamingChecksum();
    calc.update(new Uint8Array([1, 2, 3, 4]));
    const first = calc.digest();

    calc.reset();
    calc.update(new Uint8Array([1, 2, 3, 4]));
    expect(calc.digest()).toBe(first);
  });
});
