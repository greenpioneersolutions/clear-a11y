import {
  detectHoverContentNotPersistent,
  hoverContentNotPersistentRule,
} from './hover-content-not-persistent.js';

describe('visual/hover-content-not-persistent', () => {
  it('has rule metadata', () => {
    expect(hoverContentNotPersistentRule.id).toBe('visual/hover-content-not-persistent');
    expect(hoverContentNotPersistentRule.wcag).toEqual(['1.4.13']);
  });

  it('detects content that disappears on its own', () => {
    expect(detectHoverContentNotPersistent({ appeared: true, visibleAfterWait: false })).toBe(true);
  });

  it('does not flag content that stays', () => {
    expect(detectHoverContentNotPersistent({ appeared: true, visibleAfterWait: true })).toBe(false);
    expect(detectHoverContentNotPersistent({ appeared: false, visibleAfterWait: false })).toBe(
      false,
    );
  });
});
