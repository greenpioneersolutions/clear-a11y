import { detectFocusNotReturned, focusNotReturnedRule } from './focus-not-returned.js';

describe('keyboard/focus-not-returned', () => {
  it('has rule metadata', () => {
    expect(focusNotReturnedRule.id).toBe('keyboard/focus-not-returned');
    expect(focusNotReturnedRule.wcag).toEqual(['2.4.3']);
  });

  it('detects the barrier: focus drops to body after closing', () => {
    expect(
      detectFocusNotReturned({ closed: true, triggerAvailable: true, focusOnTrigger: false }),
    ).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(
      detectFocusNotReturned({ closed: true, triggerAvailable: true, focusOnTrigger: true }),
    ).toBe(false);
  });

  it('does not judge when the overlay could not be closed or the trigger is gone', () => {
    expect(
      detectFocusNotReturned({ closed: false, triggerAvailable: true, focusOnTrigger: false }),
    ).toBe(false);
    expect(
      detectFocusNotReturned({ closed: true, triggerAvailable: false, focusOnTrigger: false }),
    ).toBe(false);
  });
});
