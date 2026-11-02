import type { RuleMeta } from '@clear-a11y/core';
import { focusMoved, reduceAnnouncements } from '../lib/announcements.js';
import type { Announcement, ChangedElement, FocusInfo } from '../lib/recorder.js';

export const errorNotAnnouncedRule: RuleMeta = {
  id: 'at/error-not-announced',
  engine: 'engine-at',
  wcag: ['4.1.3'],
  tier: 'likely',
  title: 'Form error not announced',
  description:
    'Submitting the form shows error messages, but they are injected silently: they are not in a live region and focus does not move to them or to the fields. Screen reader users hear nothing and do not know the form was rejected.',
  fix: 'Do one of these after a failed submit: move focus to an error summary (tabindex="-1") or to the first invalid field whose error is linked with aria-describedby, or write a summary into a live region (role="alert") that exists from page load.',
};

export interface ErrorNotAnnouncedInput {
  /** Error messages that appeared after submitting (outside live regions). */
  errors: readonly ChangedElement[];
  announcements: readonly Announcement[];
  focus: FocusInfo;
  /** True when the engine pressed the submit button itself (so it knows the trigger). */
  knownTrigger: boolean;
}

/** Pure analysis for at/error-not-announced. */
export function detectErrorNotAnnounced(input: ErrorNotAnnouncedInput): boolean {
  if (input.errors.length === 0) return false;
  if (reduceAnnouncements(input.announcements).length > 0) return false;
  if (input.errors.some((e) => e.hasFocus)) return false;
  return !focusMoved(input.focus, input.knownTrigger);
}
