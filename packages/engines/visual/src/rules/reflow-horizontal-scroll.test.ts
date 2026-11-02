import {
  detectReflowHorizontalScroll,
  hasHorizontalScroll,
  reflowHorizontalScrollRule,
} from './reflow-horizontal-scroll.js';

describe('visual/reflow-horizontal-scroll', () => {
  it('has rule metadata', () => {
    expect(reflowHorizontalScrollRule.id).toBe('visual/reflow-horizontal-scroll');
    expect(reflowHorizontalScrollRule.wcag).toEqual(['1.4.10']);
  });

  it('detects a page wider than the viewport because of ordinary content', () => {
    expect(
      detectReflowHorizontalScroll({
        viewportWidth: 320,
        scrollWidth: 1132,
        culprits: [{ kind: 'content' }],
      }),
    ).toBe(true);
  });

  it('allows 1px of rounding', () => {
    expect(hasHorizontalScroll({ viewportWidth: 320, scrollWidth: 321 })).toBe(false);
  });

  it('does not flag a page that fits, or one widened only by exempt content', () => {
    expect(
      detectReflowHorizontalScroll({ viewportWidth: 320, scrollWidth: 320, culprits: [] }),
    ).toBe(false);
    expect(
      detectReflowHorizontalScroll({
        viewportWidth: 320,
        scrollWidth: 900,
        culprits: [{ kind: 'exempt' }, { kind: 'media' }],
      }),
    ).toBe(false);
  });
});
