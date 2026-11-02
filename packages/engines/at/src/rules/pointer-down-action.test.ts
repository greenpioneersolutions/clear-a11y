import {
  detectPointerDownAction,
  isPointerDownCandidate,
  pointerDownActionRule,
} from './pointer-down-action.js';

describe('at/pointer-down-action', () => {
  it('has rule metadata', () => {
    expect(pointerDownActionRule.id).toBe('at/pointer-down-action');
    expect(pointerDownActionRule.wcag).toEqual(['2.5.2']);
    expect(pointerDownActionRule.tier).toBe('likely');
  });

  it('detects a control that acts on mousedown with no click handler', () => {
    expect(detectPointerDownAction({ listeners: ['mousedown'], changedOnDown: true })).toBe(true);
    expect(
      detectPointerDownAction({ listeners: ['touchstart', 'focus'], changedOnDown: true }),
    ).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(detectPointerDownAction({ listeners: ['click'], changedOnDown: false })).toBe(false);
    // A down listener that changes nothing until release is fine.
    expect(detectPointerDownAction({ listeners: ['pointerdown'], changedOnDown: false })).toBe(
      false,
    );
    // Down plus up/click: the action is on release (the down handler is feedback).
    expect(isPointerDownCandidate(['pointerdown', 'pointerup'])).toBe(false);
    expect(isPointerDownCandidate(['mousedown', 'click'])).toBe(false);
    // Drag handles start on down by nature (2.5.7 covers them).
    expect(isPointerDownCandidate(['pointerdown', 'pointermove'])).toBe(false);
  });
});
