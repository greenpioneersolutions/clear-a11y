import { authPasteBlockedRule, detectAuthPasteBlocked } from './auth-paste-blocked.js';

describe('at/auth-paste-blocked', () => {
  it('has rule metadata', () => {
    expect(authPasteBlockedRule.id).toBe('at/auth-paste-blocked');
    expect(authPasteBlockedRule.wcag).toEqual(['3.3.8']);
    expect(authPasteBlockedRule.tier).toBe('likely');
  });

  it('detects a field that cancels paste', () => {
    expect(
      detectAuthPasteBlocked({ pasteBlocked: true, autocompleteOff: false, loginPassword: false }),
    ).toBe('paste-blocked');
  });

  it('detects autocomplete="off" on a login password', () => {
    expect(
      detectAuthPasteBlocked({ pasteBlocked: false, autocompleteOff: true, loginPassword: true }),
    ).toBe('autocomplete-off');
  });

  it('does not flag the correct pattern', () => {
    expect(
      detectAuthPasteBlocked({ pasteBlocked: false, autocompleteOff: false, loginPassword: true }),
    ).toBeUndefined();
    // autocomplete="off" on a sign-up or change-password form is not reported.
    expect(
      detectAuthPasteBlocked({ pasteBlocked: false, autocompleteOff: true, loginPassword: false }),
    ).toBeUndefined();
  });
});
