import { contrastRatio, diffStats, focusChange, maxContrastChange } from './pixels.js';
import type { RgbaImage } from './png.js';

/** A width x height image filled with one color, with optional per-pixel overrides. */
function image(
  width: number,
  height: number,
  fill: [number, number, number],
  overrides: Record<number, [number, number, number]> = {},
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = overrides[i] ?? fill;
    data.set([r, g, b, 255], i * 4);
  }
  return { width, height, data };
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLUE: [number, number, number] = [0x1a, 0x5f, 0xb4];
const LIGHT_GRAY: [number, number, number] = [0xdd, 0xdd, 0xdd];

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    expect(contrastRatio([0x76, 0x76, 0x76], WHITE)).toBeCloseTo(4.54, 2);
  });
});

describe('diffStats', () => {
  it('reports identical crops as unchanged', () => {
    expect(diffStats(image(4, 4, WHITE), image(4, 4, WHITE))).toMatchObject({
      changed: 0,
      bbox: null,
    });
  });

  it('counts changed pixels and their bounding box, ignoring tiny noise', () => {
    const a = image(4, 4, WHITE);
    const b = image(4, 4, WHITE, { 5: BLUE, 6: BLUE, 10: [250, 250, 250] });
    expect(diffStats(a, b)).toMatchObject({
      total: 16,
      changed: 2,
      bbox: { x: 1, y: 1, width: 2, height: 1 },
    });
  });

  it('rejects images of different sizes', () => {
    expect(() => diffStats(image(2, 2, WHITE), image(3, 2, WHITE))).toThrow(/sizes differ/);
  });
});

describe('focusChange', () => {
  it('rates a blue outline on white as strong', () => {
    const ring = Object.fromEntries(
      [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15].map((i) => [i, BLUE]),
    );
    const fc = focusChange(image(4, 4, WHITE), image(4, 4, WHITE, ring));
    expect(fc.changed).toBe(12);
    expect(fc.strong).toBe(12);
    expect(fc.maxContrast).toBeGreaterThan(6);
  });

  it('rates a light-gray outline on white as weak (below 3:1)', () => {
    const fc = focusChange(
      image(4, 4, WHITE),
      image(4, 4, WHITE, { 0: LIGHT_GRAY, 1: LIGHT_GRAY }),
    );
    expect(fc.changed).toBe(2);
    expect(fc.strong).toBe(0);
    expect(
      maxContrastChange(image(4, 4, WHITE), image(4, 4, WHITE, { 0: LIGHT_GRAY })),
    ).toBeLessThan(3);
  });
});
