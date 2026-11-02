import {
  detectHoverContentNotHoverable,
  hoverContentNotHoverableRule,
} from './hover-content-not-hoverable.js';

describe('visual/hover-content-not-hoverable', () => {
  it('has rule metadata', () => {
    expect(hoverContentNotHoverableRule.id).toBe('visual/hover-content-not-hoverable');
    expect(hoverContentNotHoverableRule.wcag).toEqual(['1.4.13']);
  });

  it('detects hover content that vanishes on the way to it', () => {
    expect(
      detectHoverContentNotHoverable({ appearedOnHover: true, visibleWhenPointerOnContent: false }),
    ).toBe(true);
  });

  it('does not flag hoverable content or focus-only content', () => {
    expect(
      detectHoverContentNotHoverable({ appearedOnHover: true, visibleWhenPointerOnContent: true }),
    ).toBe(false);
    expect(
      detectHoverContentNotHoverable({
        appearedOnHover: false,
        visibleWhenPointerOnContent: false,
      }),
    ).toBe(false);
  });
});
