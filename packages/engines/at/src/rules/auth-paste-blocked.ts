import type { RuleMeta } from '@clear-a11y/core';

export const authPasteBlockedRule: RuleMeta = {
  id: 'at/auth-paste-blocked',
  engine: 'engine-at',
  wcag: ['3.3.8'],
  tier: 'likely',
  title: 'Password or code field blocks paste or password managers',
  description:
    'A password or one-time-code field cancels paste, or a login password field sets autocomplete="off". People who rely on a password manager or copy codes from another app (many with memory, dyslexia or motor disabilities) are pushed into a cognitive function test: remembering and retyping a secret.',
  fix: 'Never cancel paste on password or code fields. Use autocomplete="current-password" on login fields, "new-password" on sign-up fields and "one-time-code" on verification codes.',
};

export interface AuthFieldInput {
  /** Dispatching a cancelable paste event on the field was cancelled by the page. */
  pasteBlocked: boolean;
  /** autocomplete="off" on the field (or on its form, with no token on the field). */
  autocompleteOff: boolean;
  /** The field is the single password field of its form and is not a new-password field. */
  loginPassword: boolean;
}

export type AuthProblem = 'paste-blocked' | 'autocomplete-off';

/**
 * Pure analysis for at/auth-paste-blocked. Paste blocking is the main signal (the WCAG
 * Understanding document names it); autocomplete="off" on a login password is reported only for
 * login forms, with a lower confidence, because browsers often ignore it for passwords.
 */
export function detectAuthPasteBlocked(input: AuthFieldInput): AuthProblem | undefined {
  if (input.pasteBlocked) return 'paste-blocked';
  if (input.autocompleteOff && input.loginPassword) return 'autocomplete-off';
  return undefined;
}
