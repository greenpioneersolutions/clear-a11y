import { focusObscuredRule, isEntirelyObscured, userCanRevealByEscape } from './focus-obscured.js';

describe('keyboard/focus-obscured', () => {
  it('has rule metadata', () => {
    expect(focusObscuredRule.id).toBe('keyboard/focus-obscured');
    expect(focusObscuredRule.wcag).toEqual(['2.4.11']);
  });

  it('detects the barrier: every sample point hits the sticky footer', () => {
    expect(isEntirelyObscured(Array(9).fill('other'))).toBe(true);
  });

  it('does not flag partly covered elements (not a 2.4.11 failure)', () => {
    expect(isEntirelyObscured(['other', 'other', 'self'])).toBe(false);
  });

  it('does not flag the correct pattern or unmeasured elements', () => {
    expect(isEntirelyObscured(Array(9).fill('self'))).toBe(false);
    expect(isEntirelyObscured([])).toBe(false);
  });

  describe('exception for content opened by the user (Understanding 2.4.11)', () => {
    const covered = Array(9).fill('other');
    const revealed = Array(9).fill('self');
    const base = {
      stateKind: 'disclosure',
      before: covered,
      afterEscape: revealed,
      focusStayed: true,
    };

    it('applies when Escape reveals the focused element without moving focus', () => {
      expect(userCanRevealByEscape(base)).toBe(true);
    });

    it('does not apply on the default page load (not opened by the user)', () => {
      expect(userCanRevealByEscape({ ...base, stateKind: 'default' })).toBe(false);
      expect(userCanRevealByEscape({ ...base, stateKind: undefined })).toBe(false);
    });

    it('does not apply when Escape moves focus or leaves the element covered', () => {
      expect(userCanRevealByEscape({ ...base, focusStayed: false })).toBe(false);
      expect(userCanRevealByEscape({ ...base, afterEscape: covered })).toBe(false);
      expect(userCanRevealByEscape({ ...base, afterEscape: [] })).toBe(false);
    });

    it('needs the element to be covered before Escape', () => {
      expect(userCanRevealByEscape({ ...base, before: revealed })).toBe(false);
    });
  });
});
