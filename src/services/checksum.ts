// High-performance CRC32 implementation using precalculated IEEE 802.3 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

export class FastStreamingChecksum {
  private crc: number = 0 ^ (-1);

  public update(chunk: Uint8Array) {
    let c = this.crc;
    const len = chunk.length;
    for (let i = 0; i < len; i++) {
      c = (c >>> 8) ^ CRC_TABLE[(c ^ chunk[i]) & 0xff];
    }
    this.crc = c;
  }

  public digest(): string {
    const finalCrc = (this.crc ^ (-1)) >>> 0;
    return finalCrc.toString(16).padStart(8, '0');
  }

  public reset() {
    this.crc = 0 ^ (-1);
  }
}
