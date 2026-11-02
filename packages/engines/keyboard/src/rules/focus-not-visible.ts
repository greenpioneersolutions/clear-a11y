import type { RuleMeta } from '@clear-a11y/core';
import type { FocusChange } from '../lib/pixels.js';

export const focusNotVisibleRule: RuleMeta = {
  id: 'keyboard/focus-not-visible',
  engine: 'engine-keyboard',
  wcag: ['2.4.7'],
  tier: 'violation',
  title: 'Focus indicator not visible',
  description:
    'Nothing on screen changes when this control receives keyboard focus, so sighted keyboard and switch users cannot tell where they are. A violation when the focused and unfocused pixels are identical; needs review when the change is tiny or has less than 3:1 contrast.',
  fix: 'Do not remove the outline without a replacement. Add a :focus-visible style with at least 3:1 contrast against the unfocused state, e.g. `a:focus-visible { outline: 3px solid #1a5fb4; outline-offset: 2px; }`.',
};

export type FocusIndicator = 'none' | 'weak' | 'visible';

/**
 * Pure analysis for keyboard/focus-not-visible. `shortSide` is the smaller side of the
 * element's box in CSS pixels.
 *
 * - `none`: no pixel changed between the unfocused and focused crops (deterministic).
 * - `visible`: enough changed pixels have at least 3:1 contrast with their unfocused color
 *   (at least half the short side, minimum 6 px: a 1 px line along a small control).
 * - `weak`: something changed, but too little or too faint to be sure.
 */
export function classifyFocusIndicator(change: FocusChange, shortSide: number): FocusIndicator {
  if (change.changed === 0) return 'none';
  const needed = Math.max(6, Math.ceil(shortSide / 2));
  return change.strong >= needed ? 'visible' : 'weak';
}
