import type { RuleMeta } from '@clear-a11y/core';
import { isBackwardJump, type BackwardJumpOptions, type StopGeometry } from '../lib/geometry.js';

export const focusOrderBackwardRule: RuleMeta = {
  id: 'keyboard/focus-order-backward',
  engine: 'engine-keyboard',
  wcag: ['2.4.3', '1.3.2'],
  tier: 'likely',
  title: 'Focus order jumps backward',
  description:
    'Pressing Tab moves focus back up the page (or against the reading direction on the same row) instead of following the visual order. Keyboard and switch users lose their place, and screen magnifier users have to search for where focus went.',
  fix: 'Make the DOM order match the visual order. Avoid positive tabindex values and CSS (grid/flex order, absolute positioning) that moves controls away from their source position.',
};

/**
 * Pure analysis for keyboard/focus-order-backward: indices of stops that were reached by a
 * backward jump from the stop before them.
 */
export function detectFocusOrderBackward(
  stops: readonly StopGeometry[],
  options: BackwardJumpOptions = {},
): number[] {
  const out: number[] = [];
  for (let i = 1; i < stops.length; i++) {
    if (isBackwardJump(stops[i - 1] as StopGeometry, stops[i] as StopGeometry, options)) {
      out.push(i);
    }
  }
  return out;
}
