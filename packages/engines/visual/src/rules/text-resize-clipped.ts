import type { RuleMeta, Tier } from '@clear-a11y/core';
import { newlyClipped, type ClipMeasure, type NewClip } from '../lib/clipping.js';

export const textResizeClippedRule: RuleMeta = {
  id: 'visual/text-resize-clipped',
  engine: 'engine-visual',
  wcag: ['1.4.4'],
  tier: 'violation',
  title: 'Text clipped at 200% text size',
  description:
    'When text is enlarged to 200% (browser zoom, or larger text settings), part of it is cut off by a box with a fixed size and overflow: hidden. People with low vision who enlarge text lose that content.',
  fix: 'Let boxes grow with their text: use min-height instead of height, avoid fixed widths on text containers, and do not combine fixed sizes with overflow: hidden. Size boxes in em or rem when they must be fixed.',
};

export type ResizeMode = 'zoom' | 'text-only';

/**
 * Pure analysis for visual/text-resize-clipped: elements that hide more text after resizing.
 * Zoom-equivalent results (narrower viewport, the way browser zoom lays out) are `violation`;
 * text-only resize (font sizes doubled by the engine) is `likely`, because the engine's own
 * inline styles can break layouts that browser zoom would not.
 */
export function detectTextResizeClipped(
  before: readonly ClipMeasure[],
  after: readonly ClipMeasure[],
  mode: ResizeMode,
): (NewClip & { tier: Tier })[] {
  const tier: Tier = mode === 'zoom' ? 'violation' : 'likely';
  return newlyClipped(before, after).map((c) => ({ ...c, tier }));
}
