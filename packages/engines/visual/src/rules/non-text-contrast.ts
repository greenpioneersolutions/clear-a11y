import type { RuleMeta } from '@clear-a11y/core';
import { NON_TEXT_CONTRAST_THRESHOLD } from '../lib/color.js';

export const nonTextContrastRule: RuleMeta = {
  id: 'visual/non-text-contrast',
  engine: 'engine-visual',
  wcag: ['1.4.11'],
  tier: 'likely',
  title: 'Control boundary has low contrast',
  description:
    'A form field or icon-only button has no visual cue with at least 3:1 contrast against the page: its border, its fill and (for icon buttons) its icon are all too faint. People with low vision cannot find the control.',
  fix: 'Give the control a border or fill with at least 3:1 contrast against the surrounding background (for example a #767676 border on white), or make the icon itself at least 3:1.',
};

export interface NonTextContrastInput {
  /** Border vs outside background, per side (an underline-only field passes on one side). */
  sideRatios: number[];
  /** Field fill vs outside background. */
  fillRatio: number;
  /** For icon-only buttons: icon pixels vs the button fill. */
  iconRatio?: number;
}

/** Pure analysis: true when no identifying cue reaches 3:1. */
export function detectNonTextContrast(input: NonTextContrastInput): boolean {
  const best = Math.max(...input.sideRatios, input.fillRatio, input.iconRatio ?? 0);
  return best < NON_TEXT_CONTRAST_THRESHOLD;
}
