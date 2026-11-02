import type { RuleMeta } from '@clear-a11y/core';

export const hoverContentNotHoverableRule: RuleMeta = {
  id: 'visual/hover-content-not-hoverable',
  engine: 'engine-visual',
  wcag: ['1.4.13'],
  tier: 'likely',
  title: 'Hover content disappears when the pointer moves onto it',
  description:
    'A tooltip or popup that appears on hover disappears when the pointer moves from the trigger onto it. People who use screen magnifiers move the pointer to read the popup, and lose it.',
  fix: 'Keep the popup open while the pointer is over the trigger or the popup: put both in one wrapper and listen for mouseleave on the wrapper, or close after a short delay that is cancelled when the pointer enters the popup. Avoid gaps between trigger and popup.',
};

export interface HoverHoverableInput {
  /** The popup appeared on pointer hover (not only on focus). */
  appearedOnHover: boolean;
  /** Still visible once the pointer reached the popup. */
  visibleWhenPointerOnContent: boolean;
}

/** Pure analysis for visual/hover-content-not-hoverable. */
export function detectHoverContentNotHoverable(input: HoverHoverableInput): boolean {
  return input.appearedOnHover && !input.visibleWhenPointerOnContent;
}
