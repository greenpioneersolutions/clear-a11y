import type { RuleMeta } from '@clear-a11y/core';

export const expandedStateMismatchRule: RuleMeta = {
  id: 'states/expanded-state-mismatch',
  engine: 'engine-states',
  wcag: ['4.1.2'],
  tier: 'violation',
  title: 'aria-expanded does not match the content',
  description:
    'A button says it is collapsed (aria-expanded="false") but activating it shows the content it controls, or it still says expanded after the content is hidden. Screen reader users are told the opposite of what is on screen and may think the button is broken.',
  fix: 'Update aria-expanded in the same code that shows or hides the controlled content: "true" while it is visible, "false" while it is hidden.',
};

export interface ExpandedStateInput {
  /** "open": after activating a collapsed trigger. "close": after activating it again. */
  phase: 'open' | 'close';
  /** aria-expanded on the trigger after the activation. */
  expandedAfter: string | null;
  /** The controlled content is visible after the activation. */
  contentVisible: boolean;
}

/**
 * Pure check for states/expanded-state-mismatch: the content opened but aria-expanded stayed
 * "false", or it closed but aria-expanded stayed "true".
 */
export function detectExpandedStateMismatch(input: ExpandedStateInput): boolean {
  return input.phase === 'open'
    ? input.contentVisible && input.expandedAfter === 'false'
    : !input.contentVisible && input.expandedAfter === 'true';
}
