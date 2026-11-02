import { inflateSync } from 'node:zlib';
import type { RgbaImage } from './pixels.js';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Minimal PNG decoder for the screenshots Chromium produces: 8-bit truecolor (RGB or RGBA),
 * non-interlaced. Avoids a third-party dependency for the only format we need.
 */
export function decodePng(buf: Uint8Array): RgbaImage {
  const bytes = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  let off = 8;
  while (off < bytes.length) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString('latin1', off + 4, off + 8);
    const body = bytes.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colorType = body[9];
      const interlace = body[12];
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(
          `unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`,
        );
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (!width || !height) throw new Error('PNG has no IHDR');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const cur = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let x = 0; x < stride; x++) {
      const v = raw[rowStart + 1 + x] ?? 0;
      const a = x >= channels ? (cur[x - channels] ?? 0) : 0;
      const b = prev[x] ?? 0;
      const c = x >= channels ? (prev[x - channels] ?? 0) : 0;
      let r: number;
      switch (filter) {
        case 0:
          r = v;
          break;
        case 1:
          r = v + a;
          break;
        case 2:
          r = v + b;
          break;
        case 3:
          r = v + ((a + b) >> 1);
          break;
        case 4:
          r = v + paeth(a, b, c);
          break;
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      cur[x] = r & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * channels] ?? 0;
      out[o + 1] = cur[x * channels + 1] ?? 0;
      out[o + 2] = cur[x * channels + 2] ?? 0;
      out[o + 3] = channels === 4 ? (cur[x * channels + 3] ?? 255) : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}
