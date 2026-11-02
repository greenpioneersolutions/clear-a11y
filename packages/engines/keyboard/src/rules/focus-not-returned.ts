import type { RuleMeta } from '@clear-a11y/core';

export const focusNotReturnedRule: RuleMeta = {
  id: 'keyboard/focus-not-returned',
  engine: 'engine-keyboard',
  wcag: ['2.4.3'],
  tier: 'likely',
  title: 'Focus not returned when the overlay closes',
  description:
    'After the dialog, menu or popover closes, keyboard focus does not go back to the control that opened it. It lands on the page body or somewhere else, so keyboard and screen reader users lose their place and have to start again from the top.',
  fix: 'When the overlay closes, move focus back to its trigger: `trigger.focus()` in the close handler. Native `<dialog>` restores focus automatically when it closes.',
};

export interface FocusReturnInput {
  /** The overlay is closed. Nothing to judge otherwise. */
  closed: boolean;
  /** The trigger is still on the page and visible. */
  triggerAvailable: boolean;
  /** document.activeElement is the trigger or inside it. */
  focusOnTrigger: boolean;
}

/** Pure analysis for keyboard/focus-not-returned. */
export function detectFocusNotReturned(input: FocusReturnInput): boolean {
  return input.closed && input.triggerAvailable && !input.focusOnTrigger;
}
