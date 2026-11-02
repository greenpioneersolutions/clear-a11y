import type { RuleMeta } from '@clear-a11y/core';

export const reflowHorizontalScrollRule: RuleMeta = {
  id: 'visual/reflow-horizontal-scroll',
  engine: 'engine-visual',
  wcag: ['1.4.10'],
  tier: 'violation',
  title: 'Content scrolls horizontally at 320 CSS px',
  description:
    'At a 320 CSS px wide viewport (what a 1280px screen shows at 400% zoom) the page scrolls sideways because an element is wider than the viewport. People who zoom in to read have to scroll in two directions for every line.',
  fix: 'Let the layout shrink: replace fixed widths with max-width: 100% or relative units, let flex and grid items wrap, and use media queries to stack columns on narrow screens.',
};

export interface ReflowHorizontalScrollInput {
  /** `document.documentElement.clientWidth` at the reflow viewport. */
  viewportWidth: number;
  /** Largest scrollWidth of html and body. */
  scrollWidth: number;
  /** Elements whose right edge passes the viewport, with their SC 1.4.10 classification. */
  culprits: { kind: 'content' | 'exempt' | 'media' }[];
}

/** True when the page scrolls horizontally by more than 1px. */
export function hasHorizontalScroll(
  input: Pick<ReflowHorizontalScrollInput, 'viewportWidth' | 'scrollWidth'>,
): boolean {
  return input.scrollWidth > input.viewportWidth + 1;
}

/**
 * Pure analysis for visual/reflow-horizontal-scroll: the page scrolls horizontally and at least one
 * culprit is ordinary content (not a data table, code block or other two-dimensional content the
 * SC exempts, and not media, which goes to needs-review).
 */
export function detectReflowHorizontalScroll(input: ReflowHorizontalScrollInput): boolean {
  return hasHorizontalScroll(input) && input.culprits.some((c) => c.kind === 'content');
}
