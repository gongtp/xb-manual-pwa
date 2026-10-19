import { deflateSync } from "node:zlib";

/** A code-drawn archive/book icon; no remote assets required. */
export function makeIcon(size: number) {
  function chunk(type: string, data: Buffer) {
    const name = Buffer.from(type);
    const bytes = Buffer.concat([name, data]);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, bytes, checksum]);
  }
  const pixels = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size; const ny = y / size;
    const book = nx > .25 && nx < .75 && ny > .24 && ny < .76;
    const spine = nx > .32 && nx < .35 && ny > .24 && ny < .76;
    const line = nx > .43 && nx < .66 && ((ny > .37 && ny < .41) || (ny > .49 && ny < .53) || (ny > .61 && ny < .65));
    const color = book && !spine && !line ? [235, 222, 181] : [23, 60, 54];
    pixels.set(color, y * (size * 3 + 1) + 1 + x * 3);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
