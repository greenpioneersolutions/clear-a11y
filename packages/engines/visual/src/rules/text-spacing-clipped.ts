import type { RuleMeta } from '@clear-a11y/core';
import { newlyClipped, type ClipMeasure, type NewClip } from '../lib/clipping.js';
import { newOverlaps, type TextBox } from '../lib/geometry.js';

export const textSpacingClippedRule: RuleMeta = {
  id: 'visual/text-spacing-clipped',
  engine: 'engine-visual',
  wcag: ['1.4.12'],
  tier: 'violation',
  title: 'Text clipped under text-spacing overrides',
  description:
    'With the WCAG text-spacing settings applied (line height 1.5, letter spacing 0.12em, word spacing 0.16em, paragraph spacing 2em), text is cut off or overlaps other text. People with dyslexia or low vision who use a spacing stylesheet or extension lose content.',
  fix: 'Do not give text containers a fixed height or width with overflow: hidden. Use min-height, let boxes grow, and size in em so they follow the text.',
};

export interface TextSpacingResult {
  clipped: NewClip[];
  overlaps: { a: TextBox; b: TextBox }[];
}

/**
 * Pure analysis for visual/text-spacing-clipped: compares the baseline layout with the layout
 * after the spacing overrides. New clipping is a `violation`; new overlap between text boxes is
 * `likely` (overlap can be harmless when the text stays readable).
 */
export function detectTextSpacingClipped(
  before: { clips: readonly ClipMeasure[]; boxes: readonly TextBox[] },
  after: { clips: readonly ClipMeasure[]; boxes: readonly TextBox[] },
): TextSpacingResult {
  return {
    clipped: newlyClipped(before.clips, after.clips),
    overlaps: newOverlaps(before.boxes, after.boxes),
  };
}
