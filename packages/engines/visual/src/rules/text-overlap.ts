import type { RuleMeta } from '@clear-a11y/core';
import { newOverlaps, type TextBox } from '../lib/geometry.js';

export const textOverlapRule: RuleMeta = {
  id: 'visual/text-overlap',
  engine: 'engine-visual',
  wcag: ['1.4.4', '1.4.10'],
  tier: 'likely',
  title: 'Text overlaps after resize or reflow',
  description:
    'After text is enlarged to 200% or the viewport is narrowed to 320 CSS px, text runs into other text or into a control. People who zoom in cannot read the overlapping words, and may hit the wrong control.',
  fix: 'Avoid fixed heights and absolute positioning for boxes that hold text. Let content flow so a growing box pushes the next one down instead of running into it.',
};

export type OverlapChange = 'zoom' | 'text-only' | 'reflow';

/** WCAG criteria for an overlap caused by a given change: resize is 1.4.4, reflow is 1.4.10. */
export function overlapWcag(change: OverlapChange): string[] {
  return change === 'reflow' ? ['1.4.10'] : ['1.4.4'];
}

/**
 * Pure analysis for visual/text-overlap: pairs of elements whose text overlaps other text or a
 * control after the change, but did not before.
 */
export function detectTextOverlap(
  before: readonly TextBox[],
  after: readonly TextBox[],
): { a: TextBox; b: TextBox }[] {
  return newOverlaps(before, after);
}
