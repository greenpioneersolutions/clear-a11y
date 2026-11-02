import { inflateSync } from 'node:zlib';

/** An RGBA image: 4 bytes per pixel, row-major. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Bytes per pixel for 8-bit color types: grayscale, RGB, (palette unsupported), gray+alpha, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Minimal PNG decoder for the screenshots Chromium produces (8-bit gray/RGB/RGBA, not interlaced).
 * Kept in-house so the engine needs no image dependency.
 */
export function decodePng(buf: Uint8Array): RgbaImage {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (!SIGNATURE.every((b, i) => buf[i] === b)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= buf.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...buf.subarray(offset + 4, offset + 8));
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const depth = body[8];
      colorType = body[9] ?? -1;
      const interlace = body[12];
      if (depth !== 8 || interlace !== 0 || !(colorType in CHANNELS)) {
        throw new Error(
          `unsupported PNG (depth ${depth}, color ${colorType}, interlace ${interlace})`,
        );
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const channels = CHANNELS[colorType] as number;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src + x] as number;
      const left = x >= channels ? (pixels[dst + x - channels] as number) : 0;
      const up = y > 0 ? (pixels[dst - stride + x] as number) : 0;
      const upLeft = y > 0 && x >= channels ? (pixels[dst - stride + x - channels] as number) : 0;
      let out: number;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + left;
          break;
        case 2:
          out = value + up;
          break;
        case 3:
          out = value + ((left + up) >> 1);
          break;
        case 4:
          out = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      pixels[dst + x] = out & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const o = i * 4;
    if (channels === 1 || channels === 2) {
      const g = pixels[j] as number;
      data[o] = g;
      data[o + 1] = g;
      data[o + 2] = g;
      data[o + 3] = channels === 2 ? (pixels[j + 1] as number) : 255;
    } else {
      data[o] = pixels[j] as number;
      data[o + 1] = pixels[j + 1] as number;
      data[o + 2] = pixels[j + 2] as number;
      data[o + 3] = channels === 4 ? (pixels[j + 3] as number) : 255;
    }
  }
  return { width, height, data };
}
