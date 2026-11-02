import type { RuleMeta } from '@clear-a11y/core';

export const reflowTwoDimensionalRule: RuleMeta = {
  id: 'visual/reflow-two-dimensional',
  engine: 'engine-visual',
  wcag: ['1.4.10'],
  tier: 'needs-review',
  title: 'Horizontally scrolling region may not need two dimensions',
  description:
    'At 320 CSS px a region scrolls sideways (or an image-like element is wider than the viewport). SC 1.4.10 allows this only for content that needs a two-dimensional layout, such as data tables, maps, diagrams, code or toolbars. A person has to decide whether this content does.',
  fix: 'If the content can be read in one column, let it wrap (flex-wrap, grid with auto-fit, max-width: 100% on images). Keep horizontal scrolling only for content that truly needs two dimensions.',
};

export interface ReflowTwoDimensionalInput {
  clientWidth: number;
  scrollWidth: number;
  /** The region is or contains a data table, code, map, media or toolbar (SC exception). */
  exempt: boolean;
}

/** Pure analysis: the region really scrolls sideways and nothing in it is covered by the exception. */
export function detectReflowTwoDimensional(input: ReflowTwoDimensionalInput): boolean {
  return input.scrollWidth > input.clientWidth + 1 && !input.exempt;
}

export const REFLOW_TWO_DIMENSIONAL_QUESTION =
  'At 320 CSS px wide, does this content need a two-dimensional layout (like a data table, map or diagram) to be understood?';
