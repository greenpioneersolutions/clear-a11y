import {
  detectHoverContentNotDismissible,
  hoverContentNotDismissibleRule,
} from './hover-content-not-dismissible.js';

describe('visual/hover-content-not-dismissible', () => {
  it('has rule metadata', () => {
    expect(hoverContentNotDismissibleRule.id).toBe('visual/hover-content-not-dismissible');
    expect(hoverContentNotDismissibleRule.wcag).toEqual(['1.4.13']);
  });

  it('detects a covering tooltip that ignores Escape', () => {
    expect(
      detectHoverContentNotDismissible({
        obscures: true,
        isError: false,
        visibleAfterEscape: true,
      }),
    ).toBe(true);
  });

  it('does not flag content that closes, covers nothing, or reports an input error', () => {
    expect(
      detectHoverContentNotDismissible({
        obscures: true,
        isError: false,
        visibleAfterEscape: false,
      }),
    ).toBe(false);
    expect(
      detectHoverContentNotDismissible({
        obscures: false,
        isError: false,
        visibleAfterEscape: true,
      }),
    ).toBe(false);
    expect(
      detectHoverContentNotDismissible({ obscures: true, isError: true, visibleAfterEscape: true }),
    ).toBe(false);
  });
});
