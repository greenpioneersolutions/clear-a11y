import type { RuleMeta } from '@clear-a11y/core';

export const hoverContentNotPersistentRule: RuleMeta = {
  id: 'visual/hover-content-not-persistent',
  engine: 'engine-visual',
  wcag: ['1.4.13'],
  tier: 'likely',
  title: 'Hover or focus content disappears on its own',
  description:
    'A tooltip or popup that appears on hover or focus disappears after a short time although the pointer and focus have not moved and nobody dismissed it. People who read slowly or use magnification do not get to finish reading it.',
  fix: 'Keep the content visible until the pointer or focus leaves, the user presses Escape, or the information is no longer valid. Remove auto-hide timers.',
};

export interface HoverPersistentInput {
  /** Visible right after it appeared. */
  appeared: boolean;
  /** Still visible after waiting, with pointer/focus unchanged and no dismissal. */
  visibleAfterWait: boolean;
}

/** Pure analysis for visual/hover-content-not-persistent. */
export function detectHoverContentNotPersistent(input: HoverPersistentInput): boolean {
  return input.appeared && !input.visibleAfterWait;
}
