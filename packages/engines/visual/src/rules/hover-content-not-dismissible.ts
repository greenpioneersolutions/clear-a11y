import type { RuleMeta } from '@clear-a11y/core';

export const hoverContentNotDismissibleRule: RuleMeta = {
  id: 'visual/hover-content-not-dismissible',
  engine: 'engine-visual',
  wcag: ['1.4.13'],
  tier: 'violation',
  title: 'Hover or focus content cannot be dismissed',
  description:
    'Content that appears on hover or focus (a tooltip or popup) covers other content, and pressing Escape does not hide it while the pointer or focus stays put. People who magnify the screen cannot see what it covers without moving away and losing their place.',
  fix: 'Close the popup when Escape is pressed (a keydown listener on document), without requiring the pointer or focus to move.',
};

export interface HoverDismissInput {
  /** The popup covers other text or controls. */
  obscures: boolean;
  /** The popup communicates an input error (exempt). */
  isError: boolean;
  /** Still visible after Escape, with pointer/focus unchanged. */
  visibleAfterEscape: boolean;
}

/**
 * Pure analysis for visual/hover-content-not-dismissible. SC 1.4.13 only requires dismissal when
 * the content obscures or replaces other content and is not an input error.
 */
export function detectHoverContentNotDismissible(input: HoverDismissInput): boolean {
  return input.obscures && !input.isError && input.visibleAfterEscape;
}
