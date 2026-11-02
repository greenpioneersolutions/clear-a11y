import type { RuleMeta } from '@clear-a11y/core';

export const focusObscuredRule: RuleMeta = {
  id: 'keyboard/focus-obscured',
  engine: 'engine-keyboard',
  wcag: ['2.4.11'],
  tier: 'violation',
  title: 'Focused element hidden by other content',
  description:
    'When this control receives keyboard focus it is completely covered by other author content, such as a sticky header, sticky footer or banner. Keyboard users cannot see what they are about to activate; screen magnifier users lose the focus entirely.',
  fix: 'Reserve space for sticky content so focused elements scroll clear of it, e.g. `html { scroll-padding-top: <header height>; scroll-padding-bottom: <footer height>; }`, or make the banner dismissible and non-overlapping.',
};

/** What `elementFromPoint` hit at one sample point inside the focused element's box. */
export type HitSample = 'self' | 'other';

/**
 * Pure analysis for keyboard/focus-obscured. Entirely hidden means every sample point inside the
 * on-screen part of the box hits other content. Partly covered is not a 2.4.11 failure.
 */
export function isEntirelyObscured(samples: readonly HitSample[]): boolean {
  return samples.length > 0 && samples.every((s) => s === 'other');
}

export interface DismissCheck {
  /** Kind of the page state ("default", "disclosure", "menu", ...). */
  stateKind: string | undefined;
  /** Samples with the stop focused, before pressing Escape. */
  before: readonly HitSample[];
  /** Samples after pressing Escape. */
  afterEscape: readonly HitSample[];
  /** Focus is still on the same element after Escape. */
  focusStayed: boolean;
}

/**
 * Pure: the 2.4.11 exception for content opened by the user (W3C Understanding 2.4.11). In a
 * state the user opened (anything but the default page load), a stop that is entirely covered is
 * not a failure when pressing Escape, without moving focus, reveals it.
 */
export function userCanRevealByEscape(c: DismissCheck): boolean {
  return (
    !!c.stateKind &&
    c.stateKind !== 'default' &&
    isEntirelyObscured(c.before) &&
    c.focusStayed &&
    c.afterEscape.length > 0 &&
    !isEntirelyObscured(c.afterEscape)
  );
}
