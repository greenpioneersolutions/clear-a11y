import { contrastRatio } from './color.js';
import {
  diffMask,
  glyphContrast,
  lineSamples,
  medianColor,
  percentile,
  sampleEvenly,
  type RgbaImage,
} from './pixels.js';

/** Synthetic image filled by a per-pixel function. */
const image = (
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number],
): RgbaImage => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  return { width, height, data };
};

describe('pixels', () => {
  it('computes nearest-rank percentiles', () => {
    const v = [5, 1, 4, 2, 3];
    expect(percentile(v, 50)).toBe(3);
    expect(percentile(v, 0)).toBe(1);
    expect(percentile(v, 100)).toBe(5);
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        10,
      ),
    ).toBe(10);
    expect(percentile([], 50)).toBeNaN();
  });

  it('takes the per-channel median color', () => {
    const c = medianColor([
      { r: 0, g: 10, b: 0, a: 1 },
      { r: 100, g: 10, b: 0, a: 1 },
      { r: 200, g: 250, b: 0, a: 1 },
    ]);
    expect(c).toEqual({ r: 100, g: 10, b: 0, a: 1 });
    expect(medianColor([])).toBeUndefined();
  });

  it('samples evenly and deterministically', () => {
    expect(sampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(sampleEvenly([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
  });

  it('finds glyph pixels as the difference between shown and hidden text', () => {
    const bg = image(10, 10, () => [200, 200, 200]);
    const withText = image(10, 10, (x, y) =>
      x >= 3 && x < 6 && y >= 3 && y < 6 ? [255, 255, 255] : [200, 200, 200],
    );
    const mask = diffMask(withText, bg);
    expect(mask.length).toBe(9);
    expect(mask).toContain(3 * 10 + 3);
  });

  it('measures contrast against the real background under each glyph pixel', () => {
    // Left half dark navy, right half pale: white text across both.
    const bg = image(20, 10, (x) => (x < 10 ? [28, 61, 90] : [246, 245, 244]));
    const mask = Array.from({ length: 200 }, (_, i) => i);
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const r = glyphContrast(mask, bg, white);
    if (!r) throw new Error('no measurement');
    const dark = contrastRatio(white, { r: 28, g: 61, b: 90 });
    const pale = contrastRatio(white, { r: 246, g: 245, b: 244 });
    expect(r.worst).toBeCloseTo(pale, 5);
    expect(r.p10).toBeCloseTo(pale, 5);
    expect([dark, pale].some((v) => Math.abs(v - r.median) < 1e-6)).toBe(true);
    expect(glyphContrast([], bg, white)).toBeUndefined();
  });

  it('accounts for opacity of the text', () => {
    const bg = image(4, 4, () => [255, 255, 255]);
    const mask = [0, 1, 2, 3];
    const black = { r: 0, g: 0, b: 0, a: 1 };
    expect(glyphContrast(mask, bg, black)?.median).toBeCloseTo(21, 5);
    expect(glyphContrast(mask, bg, black, 0.3)?.median).toBeLessThan(3);
  });

  it('samples pixels along a line and clamps to the image', () => {
    const img = image(5, 5, (x) => [x * 10, 0, 0]);
    expect(lineSamples(img, { x: 0, y: 2 }, { x: 4, y: 2 }).map((p) => p.r)).toEqual([
      0, 10, 20, 30, 40,
    ]);
    expect(lineSamples(img, { x: -2, y: 0 }, { x: 1, y: 0 })).toHaveLength(2);
  });
});
