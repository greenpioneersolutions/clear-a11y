import { hiddenOverflow, newlyClipped, type ClipMeasure } from './clipping.js';

const m = (
  id: number,
  clientHeight: number,
  scrollHeight: number,
  extra: Partial<ClipMeasure> = {},
): ClipMeasure => ({
  id,
  selector: `#e${id}`,
  clientWidth: 200,
  clientHeight,
  scrollWidth: 200,
  scrollHeight,
  ...extra,
});

describe('clipping', () => {
  it('ignores sub-pixel overflow', () => {
    expect(hiddenOverflow(m(1, 48, 49))).toEqual({ x: 0, y: 0 });
    expect(hiddenOverflow(m(1, 48, 72))).toEqual({ x: 0, y: 24 });
  });

  it('reports elements that start clipping after the change', () => {
    const out = newlyClipped([m(1, 48, 48)], [m(1, 48, 72)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.extra).toEqual({ x: 0, y: 24 });
  });

  it('reports elements that were already clipped and now hide more', () => {
    expect(newlyClipped([m(1, 48, 72)], [m(1, 48, 96)])).toHaveLength(1);
  });

  it('does not report unchanged clipping or tiny growth', () => {
    expect(newlyClipped([m(1, 48, 72)], [m(1, 48, 72)])).toHaveLength(0);
    expect(newlyClipped([m(1, 48, 48)], [m(1, 48, 50)])).toHaveLength(0);
  });

  it('reports horizontal truncation (ellipsis)', () => {
    const before = m(1, 20, 20, { scrollWidth: 200, ellipsis: true });
    const after = m(1, 20, 20, { scrollWidth: 320, ellipsis: true });
    expect(newlyClipped([before], [after])[0]?.extra.x).toBe(120);
  });

  it('ignores elements without a baseline', () => {
    expect(newlyClipped([], [m(1, 48, 96)])).toHaveLength(0);
  });
});
