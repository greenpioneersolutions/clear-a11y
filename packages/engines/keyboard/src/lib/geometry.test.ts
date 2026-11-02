import { isBackwardJump, readingOrder, rowOf, sameRow } from './geometry.js';

const r = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });
const stop = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
  rect: r(x, y),
  ...extra,
});

describe('sameRow / rowOf / readingOrder', () => {
  it('groups boxes whose centers are within half the smaller height', () => {
    expect(sameRow(r(0, 100), r(200, 110))).toBe(true);
    expect(sameRow(r(0, 100), r(200, 130))).toBe(false);
    expect(rowOf([r(0, 100), r(200, 105), r(0, 200)])).toEqual([0, 0, 1]);
  });

  it('orders rows top to bottom, then by reading direction', () => {
    const rects = [r(200, 100), r(0, 200), r(0, 102)];
    expect(readingOrder(rects)).toEqual([2, 0, 1]);
    expect(readingOrder(rects, true)).toEqual([0, 2, 1]);
  });
});

describe('isBackwardJump', () => {
  it('flags moving left on the same row (LTR)', () => {
    expect(isBackwardJump(stop(300, 100), stop(0, 100))).toBe(true);
    expect(isBackwardJump(stop(0, 100), stop(300, 100))).toBe(false);
  });

  it('ignores small horizontal wobble', () => {
    expect(isBackwardJump(stop(10, 100), stop(5, 100))).toBe(false);
  });

  it('flags moving up a row', () => {
    expect(isBackwardJump(stop(0, 200, { rect: r(0, 200, 640) }), stop(336, 100))).toBe(true);
    expect(isBackwardJump(stop(0, 100), stop(0, 200))).toBe(false);
  });

  it('allows the wrap to the top of the next column', () => {
    expect(isBackwardJump(stop(0, 300), stop(336, 100))).toBe(false);
  });

  it('skips same-row checks for RTL and mirrors the column wrap', () => {
    expect(isBackwardJump(stop(300, 100), stop(0, 100), { rtl: true })).toBe(false);
    expect(isBackwardJump(stop(336, 300), stop(0, 100), { rtl: true })).toBe(false);
    expect(isBackwardJump(stop(0, 300), stop(336, 100), { rtl: true })).toBe(true);
  });

  it('ignores jumps between regions, fixed bars and invisible stops', () => {
    expect(isBackwardJump(stop(0, 300, { region: 'main' }), stop(0, 10, { region: 'nav' }))).toBe(
      false,
    );
    expect(isBackwardJump(stop(0, 300), stop(0, 10, { fixed: true }))).toBe(false);
    expect(isBackwardJump(stop(0, 300), stop(0, 10, { visible: false }))).toBe(false);
    expect(isBackwardJump(stop(0, 300), { rect: r(0, 10, 0, 0) })).toBe(false);
  });
});
