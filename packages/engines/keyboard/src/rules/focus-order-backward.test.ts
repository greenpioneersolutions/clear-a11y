import { detectFocusOrderBackward, focusOrderBackwardRule } from './focus-order-backward.js';

const box = (x: number, y: number, width = 300, height = 40, region = 'main') => ({
  rect: { x, y, width, height },
  region,
});

describe('keyboard/focus-order-backward', () => {
  it('has rule metadata', () => {
    expect(focusOrderBackwardRule.id).toBe('keyboard/focus-order-backward');
    expect(focusOrderBackwardRule.wcag).toEqual(['2.4.3', '1.3.2']);
    expect(focusOrderBackwardRule.tier).toBe('likely');
  });

  it('detects the barrier: first name -> country (row 2) -> last name (back up to row 1)', () => {
    const stops = [
      box(8, 100), // first name, row 1 column 1
      box(8, 180, 640), // country, row 2 spanning both columns
      box(336, 100), // last name, row 1 column 2
      box(8, 260, 120), // submit, row 3
    ];
    expect(detectFocusOrderBackward(stops)).toEqual([2]);
  });

  it('does not flag the correct pattern', () => {
    const stops = [box(8, 100), box(336, 100), box(8, 180, 640), box(8, 260, 120)];
    expect(detectFocusOrderBackward(stops)).toEqual([]);
  });

  it('does not flag a two-column layout that wraps to the top of the next column', () => {
    const stops = [box(8, 100), box(8, 180), box(8, 260), box(336, 100), box(336, 180)];
    expect(detectFocusOrderBackward(stops)).toEqual([]);
  });
});
