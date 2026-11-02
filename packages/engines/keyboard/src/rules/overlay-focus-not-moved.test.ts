import { detectOverlayFocusNotMoved, overlayFocusNotMovedRule } from './overlay-focus-not-moved.js';

describe('keyboard/overlay-focus-not-moved', () => {
  it('has rule metadata', () => {
    expect(overlayFocusNotMovedRule.id).toBe('keyboard/overlay-focus-not-moved');
    expect(overlayFocusNotMovedRule.wcag).toEqual(['2.4.3']);
  });

  it('detects the barrier: focus stays on the trigger behind the dialog', () => {
    expect(
      detectOverlayFocusNotMoved({ kind: 'modal', overlayVisible: true, focusInside: false }),
    ).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(
      detectOverlayFocusNotMoved({ kind: 'modal', overlayVisible: true, focusInside: true }),
    ).toBe(false);
  });

  it('only expects dialogs to take focus', () => {
    expect(
      detectOverlayFocusNotMoved({ kind: 'menu', overlayVisible: true, focusInside: false }),
    ).toBe(false);
    expect(
      detectOverlayFocusNotMoved({ kind: 'modal', overlayVisible: false, focusInside: false }),
    ).toBe(false);
  });
});
