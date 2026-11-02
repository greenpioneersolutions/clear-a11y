import {
  distanceToBox,
  failsSpacing,
  intersection,
  isUndersized,
  newOverlaps,
  overlappingPairs,
  overlaps,
  type TextBox,
} from './geometry.js';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('geometry', () => {
  it('measures intersections and overlap with a minimum', () => {
    expect(intersection(box(0, 0, 10, 10), box(5, 5, 10, 10))).toEqual({ width: 5, height: 5 });
    expect(intersection(box(0, 0, 10, 10), box(20, 0, 10, 10))).toEqual({ width: 0, height: 0 });
    expect(overlaps(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
    expect(overlaps(box(0, 0, 10, 10), box(9, 0, 10, 10))).toBe(false); // 1px touch
  });

  it('measures distance from a point to a box', () => {
    expect(distanceToBox({ x: 5, y: 5 }, box(0, 0, 10, 10))).toBe(0);
    expect(distanceToBox({ x: 13, y: 14 }, box(0, 0, 10, 10))).toBe(5);
  });

  it('detects undersized targets with sub-pixel tolerance', () => {
    expect(isUndersized(box(0, 0, 16, 16))).toBe(true);
    expect(isUndersized(box(0, 0, 24, 23.995))).toBe(false);
    expect(isUndersized(box(0, 0, 40, 20))).toBe(true);
  });

  describe('spacing exception (24px circles)', () => {
    const a = box(0, 0, 16, 16);
    it('fails for two 16px targets 4px apart', () => {
      expect(failsSpacing(a, [{ box: box(20, 0, 16, 16), undersized: true }])).toBe(true);
    });
    it('passes when circles only touch (16px targets 8px apart)', () => {
      expect(failsSpacing(a, [{ box: box(24, 0, 16, 16), undersized: true }])).toBe(false);
    });
    it('passes for two 16px targets 30px apart', () => {
      expect(failsSpacing(a, [{ box: box(46, 0, 16, 16), undersized: true }])).toBe(false);
    });
    it('fails when the circle reaches a large target', () => {
      // Center at 8, radius 12 -> reaches x=20; a big button starts at x=18.
      expect(failsSpacing(a, [{ box: box(18, 0, 44, 44), undersized: false }])).toBe(true);
    });
    it('ignores the circle of a target that is not undersized', () => {
      expect(failsSpacing(a, [{ box: box(21, 0, 30, 30), undersized: false }])).toBe(false);
    });
  });

  describe('text overlap', () => {
    const tb = (
      id: number,
      rects: ReturnType<typeof box>[],
      extra: Partial<TextBox> = {},
    ): TextBox => ({
      id,
      selector: `#e${id}`,
      kind: 'text',
      rects,
      ancestors: [],
      ...extra,
    });

    it('finds overlapping text from different elements', () => {
      const pairs = overlappingPairs([tb(1, [box(0, 0, 100, 20)]), tb(2, [box(50, 10, 100, 20)])]);
      expect([...pairs]).toEqual(['1|2']);
    });

    it('skips ancestors, the same element and control/control pairs', () => {
      expect(
        overlappingPairs([
          tb(1, [box(0, 0, 100, 20)]),
          tb(2, [box(0, 0, 50, 20)], { ancestors: [1] }),
        ]).size,
      ).toBe(0);
      expect(overlappingPairs([tb(1, [box(0, 0, 100, 20), box(0, 10, 100, 20)])]).size).toBe(0);
      expect(
        overlappingPairs([
          tb(1, [box(0, 0, 100, 20)], { kind: 'control' }),
          tb(2, [box(0, 0, 100, 20)], { kind: 'control' }),
        ]).size,
      ).toBe(0);
    });

    it('reports only overlaps that are new and between known elements', () => {
      const before = [
        tb(1, [box(0, 0, 100, 20)]),
        tb(2, [box(0, 30, 100, 20)]),
        tb(3, [box(0, 0, 10, 10)]),
      ];
      const after = [
        tb(1, [box(0, 0, 100, 40)]),
        tb(2, [box(0, 30, 100, 20)]),
        tb(3, [box(0, 0, 10, 10)]), // overlapped 1 before too
        tb(9, [box(0, 0, 100, 100)]), // new element: no baseline
      ];
      const found = newOverlaps(before, after).map(({ a, b }) => [a.id, b.id]);
      expect(found).toEqual([[1, 2]]);
    });
  });
});
