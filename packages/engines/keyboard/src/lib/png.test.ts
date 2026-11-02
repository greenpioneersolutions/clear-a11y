import { deflateSync } from 'node:zlib';
import { decodePng } from './png.js';

/** Encodes raw filtered scanlines as a PNG (CRCs are not checked by the decoder). */
function encode(width: number, height: number, colorType: number, scanlines: number[][]): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(scanlines.flat()))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('decodePng', () => {
  it('decodes RGB with none/sub/up filters', () => {
    const png = encode(2, 2, 2, [
      [0, 10, 20, 30, 40, 50, 60], // filter none
      [2, 1, 1, 1, 1, 1, 1], // filter up: previous row + 1
    ]);
    const img = decodePng(png);
    expect(img.width).toBe(2);
    expect(Array.from(img.data)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255, 11, 21, 31, 255, 41, 51, 61, 255,
    ]);
    const sub = decodePng(encode(2, 1, 6, [[1, 5, 5, 5, 255, 1, 1, 1, 0]]));
    expect(Array.from(sub.data)).toEqual([5, 5, 5, 255, 6, 6, 6, 255]);
  });

  it('decodes average and paeth filters', () => {
    const avg = decodePng(
      encode(1, 2, 0, [
        [0, 100],
        [3, 10],
      ]),
    );
    expect(avg.data[4]).toBe(60); // 10 + floor((0 + 100) / 2)
    const paeth = decodePng(
      encode(1, 2, 0, [
        [0, 100],
        [4, 5],
      ]),
    );
    expect(paeth.data[4]).toBe(105); // paeth(left 0, up 100, upleft 0) = 100
  });

  it('rejects non-PNG input', () => {
    expect(() => decodePng(Buffer.from('nope'))).toThrow(/not a PNG/);
  });
});
