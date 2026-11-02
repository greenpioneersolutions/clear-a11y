import { deflateSync } from 'node:zlib';
import { decodePng } from './png.js';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, body: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
};

/** Encodes rows (already filtered: first byte of each row is the filter type). */
const encode = (width: number, height: number, colorType: 2 | 6, rows: number[][]) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(rows.flat()))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

describe('decodePng', () => {
  it('decodes RGBA with no filter', () => {
    const png = encode(2, 1, 6, [[0, 255, 0, 0, 255, 0, 0, 255, 128]]);
    const img = decodePng(png);
    expect(img.width).toBe(2);
    expect(Array.from(img.data)).toEqual([255, 0, 0, 255, 0, 0, 255, 128]);
  });

  it('decodes RGB with sub, up, average and paeth filters', () => {
    // Raw pixels: row0 = (10,20,30)(20,30,40); row1 = (15,25,35)(30,40,50); row2, row3 same as row1.
    const rows = [
      [1, 10, 20, 30, 10, 10, 10], // sub
      [2, 5, 5, 5, 10, 10, 10], // up
      [3, 15 - 7, 25 - 12, 35 - 17, 30 - 22, 40 - 32, 50 - 42], // average: floor((left+up)/2)
      [4, 0, 0, 0, 0, 0, 0], // paeth picks up/left equal values
    ];
    const img = decodePng(encode(2, 4, 2, rows));
    const px = (x: number, y: number) =>
      Array.from(img.data.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
    expect(px(0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(1, 0)).toEqual([20, 30, 40, 255]);
    expect(px(0, 1)).toEqual([15, 25, 35, 255]);
    expect(px(1, 1)).toEqual([30, 40, 50, 255]);
    expect(px(0, 2)).toEqual([15, 25, 35, 255]);
    expect(px(1, 2)).toEqual([30, 40, 50, 255]);
    expect(px(0, 3)).toEqual([15, 25, 35, 255]);
    expect(px(1, 3)).toEqual([30, 40, 50, 255]);
  });

  it('rejects non-PNG input and unsupported formats', () => {
    expect(() => decodePng(Buffer.from('nope'))).toThrow(/not a PNG/);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 16;
    ihdr[9] = 6;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
    ]);
    expect(() => decodePng(png)).toThrow(/unsupported/);
  });
});
