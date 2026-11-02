import type { FocusStop } from '@clear-a11y/core';
import { layoutFocusPath, renderFocusPath, stopLabel } from './focus-path.js';

const stops: FocusStop[] = [
  { index: 0, selector: '#a', name: 'A', rect: { x: 100, y: 100, width: 100, height: 20 } },
  { index: 1, selector: '#b', name: 'B', rect: { x: 100, y: 300, width: 100, height: 20 } },
  {
    index: 2,
    selector: '#c',
    name: 'C',
    role: 'link',
    rect: { x: 300, y: 100, width: 100, height: 20 },
    backward: true,
  },
];

describe('layoutFocusPath', () => {
  it('translates rects to the diagram origin without enlarging', () => {
    const l = layoutFocusPath(stops)!;
    // bbox 300 x 220 at scale 1, plus 28px padding on each side
    expect(l.width).toBe(356);
    expect(l.height).toBe(276);
    expect(l.stops.map((s) => [s.n, s.cx, s.cy])).toEqual([
      [1, 78, 38],
      [2, 78, 238],
      [3, 278, 38],
    ]);
  });

  it('scales wide pages down to the max width', () => {
    const wide: FocusStop[] = [
      { index: 0, selector: '#a', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { index: 1, selector: '#b', rect: { x: 1990, y: 0, width: 10, height: 10 } },
    ];
    const l = layoutFocusPath(wide, { maxWidth: 400 })!;
    expect(l.width).toBe(400);
    expect(l.stops[1]!.box.x + l.stops[1]!.box.width).toBeCloseTo(372, 0);
  });

  it('joins consecutive stops center to center with the arrowhead at the midpoint', () => {
    const l = layoutFocusPath(stops)!;
    expect(l.arrows).toEqual([
      { from: 1, to: 2, x1: 78, y1: 38, mx: 78, my: 138, x2: 78, y2: 238, backward: false },
      { from: 2, to: 3, x1: 78, y1: 238, mx: 178, my: 138, x2: 278, y2: 38, backward: true },
    ]);
  });

  it('skips stops without rects and never draws an arrow across the gap', () => {
    const gap: FocusStop[] = [stops[0]!, { index: 1, selector: '#hidden' }, stops[2]!];
    const l = layoutFocusPath(gap)!;
    expect(l.stops.map((s) => s.n)).toEqual([1, 3]);
    expect(l.arrows).toEqual([]);
    expect(layoutFocusPath([{ index: 0, selector: '#x' }])).toBeUndefined();
  });
});

describe('renderFocusPath', () => {
  const html = renderFocusPath(stops, 'finding-1');

  it('marks backward jumps with dash, color class and a text label', () => {
    expect(html).toContain('class="fp-arrow fp-back"');
    expect(html).toContain('>backward</span>');
    expect(html).toContain('<strong class="fp-back-text">backward jump</strong> from 2. B');
    expect(html).toContain('1 backward jump.');
  });

  it('has an ordered list text alternative and a labelled image', () => {
    expect(html).toMatch(/<ol class="fp-list">(<li>.*?<\/li>){3}<\/ol>/);
    expect(html).toContain('role="img" aria-labelledby="fp-finding-1-cap"');
    expect(html).toContain('<svg class="fp-svg"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('labels stops by name and role, else selector', () => {
    expect(stopLabel(stops[2]!)).toBe('C (link)');
    expect(stopLabel({ index: 0, selector: '#x' })).toBe('#x');
  });
});
