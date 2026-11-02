import type { RuleMeta, Tier } from '@clear-a11y/core';

export const clickNotFocusableRule: RuleMeta = {
  id: 'keyboard/click-not-focusable',
  engine: 'engine-keyboard',
  wcag: ['2.1.1'],
  tier: 'likely',
  title: 'Clickable element not reachable by keyboard',
  description:
    'This element reacts to mouse clicks but cannot receive keyboard focus, and nothing focusable around it offers the same action. Keyboard-only, switch and voice users cannot use it.',
  fix: 'Use a real control: `<button type="button">` for actions or `<a href>` for navigation. If you must keep the element, add `tabindex="0"`, a role and Enter/Space key handlers.',
};

export interface ClickCandidate {
  /** A click/mousedown/pointerdown listener is attached directly to the element. */
  hasListener: boolean;
  /** An inline `onclick` attribute or property. */
  hasOnclick: boolean;
  /** Computed `cursor: pointer` (the topmost element of a pointer region). */
  pointerCursor: boolean;
  /** The element, an ancestor or a descendant can receive focus. */
  focusableNearby: boolean;
  visible: boolean;
}

/**
 * Pure analysis for keyboard/click-not-focusable. Returns the tier, or null when not a barrier:
 * `likely` with a click handler, `needs-review` with only a pointer cursor.
 */
export function classifyClickCandidate(c: ClickCandidate): Tier | null {
  if (!c.visible || c.focusableNearby) return null;
  if (c.hasListener || c.hasOnclick) return 'likely';
  if (c.pointerCursor) return 'needs-review';
  return null;
}
