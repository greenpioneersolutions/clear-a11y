import type { RuleMeta } from '@clear-a11y/core';
import type { ChangedElement } from '../lib/recorder.js';

export const expandedStateMissingRule: RuleMeta = {
  id: 'at/expanded-state-missing',
  engine: 'engine-at',
  wcag: ['4.1.2'],
  tier: 'violation',
  title: 'Toggle button without expanded state',
  description:
    'A button shows and hides a section of the page, but it never tells assistive technology whether that section is open (no aria-expanded). Screen reader users hear "button" and have to hunt around to find out whether anything happened.',
  fix: 'Add aria-expanded="false" to the button and switch it to "true" when the section is shown (and back when hidden). Point aria-controls at the section. A native <details>/<summary> element does this for you.',
};

/**
 * Attributes through which a button exposes an expanded or pressed state to assistive technology.
 * A popover invoker (`popovertarget`) needs no aria-expanded: browsers expose its expanded state
 * from the popover's open state (HTML-AAM; verified in Chromium's accessibility tree).
 */
export const STATE_ATTRIBUTES: readonly string[] = [
  'aria-expanded',
  'aria-pressed',
  'popovertarget',
];

/** True when a button with these attribute names already exposes a state. */
export function declaresExpandedState(attributeNames: readonly string[]): boolean {
  return attributeNames.some((name) => STATE_ATTRIBUTES.includes(name.toLowerCase()));
}

/** What two clicks on a button did to the page. Collected by the engine's button probe. */
export interface ExpandedStateMissingInput {
  /** The button already exposes a state (aria-expanded or aria-pressed) or opens a popup (aria-haspopup). */
  declaresState: boolean;
  /** Elements the first click showed / hid. */
  shown: readonly ChangedElement[];
  hidden: readonly ChangedElement[];
  /** The second click undid the first (what was shown is hidden again, or the reverse). */
  reverted: boolean;
}

/** Revealed content that counts as "a section of this page" (not a dialog, menu or the button's own label). */
export function toggledContent(input: Pick<ExpandedStateMissingInput, 'shown' | 'hidden'>) {
  return [...input.shown, ...input.hidden].filter(
    (c) => !c.insideTrigger && !c.isPopup && c.text.length > 0,
  );
}

/**
 * Pure analysis for at/expanded-state-missing: the button toggles visible content back and
 * forth (a disclosure) and exposes no state for it.
 */
export function detectExpandedStateMissing(input: ExpandedStateMissingInput): boolean {
  if (input.declaresState || !input.reverted) return false;
  return toggledContent(input).length > 0;
}
