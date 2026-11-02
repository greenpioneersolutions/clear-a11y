import { isVerifiedPass, measureBoundary as measureOrUndefined } from './contrast.js';
import type { RgbaImage } from './pixels.js';
import type { NonTextCandidate } from './probe.js';

/** White page with a 40x20 box at (4,4): `border` px of `edge` color, then `fill`. */
const field = (
  edge: [number, number, number],
  fill: [number, number, number],
  border = 1,
  sides: Partial<Record<'top' | 'right' | 'bottom' | 'left', boolean>> = {
    top: true,
    right: true,
    bottom: true,
    left: true,
  },
  icon?: [number, number, number],
): RgbaImage => {
  const width = 48;
  const height = 28;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let c: [number, number, number] = [255, 255, 255];
      const inside = x >= 4 && x < 44 && y >= 4 && y < 24;
      if (inside) {
        c = fill;
        if (
          (sides.top && y < 4 + border) ||
          (sides.bottom && y >= 24 - border) ||
          (sides.left && x < 4 + border) ||
          (sides.right && x >= 44 - border)
        )
          c = edge;
        if (icon && x >= 20 && x < 28 && y >= 10 && y < 18) c = icon;
      }
      data.set([...c, 255], (y * width + x) * 4);
    }
  return { width, height, data };
};

const cand = (kind: NonTextCandidate['kind'], b = 1): NonTextCandidate => ({
  id: 1,
  selector: '#f',
  box: { x: 4, y: 4, width: 40, height: 20 },
  borders: { top: b, right: b, bottom: b, left: b },
  kind,
});
const box = { x: 4, y: 4, width: 40, height: 20 };
const measureBoundary = (...args: Parameters<typeof measureOrUndefined>) => {
  const m = measureOrUndefined(...args);
  if (!m) throw new Error('no measurement');
  return m;
};

describe('measureBoundary', () => {
  it('measures a faint #ddd border as about 1.36:1', () => {
    const m = measureBoundary(field([0xdd, 0xdd, 0xdd], [255, 255, 255]), box, cand('input'));
    expect(Math.max(...m.sideRatios)).toBeCloseTo(1.36, 2);
    expect(m.fillRatio).toBeCloseTo(1, 5);
  });

  it('measures a #767676 border as 4.5:1', () => {
    const m = measureBoundary(field([0x76, 0x76, 0x76], [255, 255, 255]), box, cand('input'));
    expect(Math.min(...m.sideRatios)).toBeGreaterThan(4.5);
  });

  it('credits an underline-only field on its one bordered side', () => {
    const img = field([0x59, 0x59, 0x59], [255, 255, 255], 2, { bottom: true });
    const c = { ...cand('input'), borders: { top: 0, right: 0, bottom: 2, left: 0 } };
    const m = measureBoundary(img, box, c);
    expect(Math.max(...m.sideRatios)).toBeGreaterThan(3);
    expect(Math.min(...m.sideRatios)).toBeCloseTo(1, 5);
  });

  it('credits a strong fill without a border', () => {
    const img = field([0x1c, 0x3d, 0x5a], [0x1c, 0x3d, 0x5a], 0, {});
    const m = measureBoundary(img, box, cand('input', 0));
    expect(m.fillRatio).toBeGreaterThan(3);
  });

  it('measures the icon of an icon-only button', () => {
    const img = field([255, 255, 255], [255, 255, 255], 0, {}, [0x33, 0x33, 0x33]);
    const m = measureBoundary(img, box, cand('icon-button', 0));
    expect(m.iconRatio).toBeGreaterThan(3);
  });
});

describe('isVerifiedPass (ADR 0003)', () => {
  const text = { x: 10, y: 10, width: 200, height: 40 };
  const good = { samples: 600, median: 8, p10: 6, worst: 5 };

  it('accepts a measurement that covers the whole text with enough glyph pixels', () => {
    expect(isVerifiedPass(good, { x: 8, y: 8, width: 204, height: 44 }, text)).toBe(true);
  });

  it('rejects partial screenshots (long text sampled from the top) and thin samples', () => {
    expect(isVerifiedPass(good, { x: 8, y: 8, width: 204, height: 20 }, text)).toBe(false);
    expect(isVerifiedPass(good, { x: 40, y: 8, width: 204, height: 44 }, text)).toBe(false);
    expect(
      isVerifiedPass({ ...good, samples: 12 }, { x: 8, y: 8, width: 204, height: 44 }, text),
    ).toBe(false);
    expect(isVerifiedPass(undefined, { x: 8, y: 8, width: 204, height: 44 }, text)).toBe(false);
  });
});
