import type { RuleMeta } from '@clear-a11y/core';
import { orientationLockedRule } from './orientation-locked.js';
import { motionWithoutPauseRule } from './motion-without-pause.js';
import { targetSizeRule } from './target-size.js';
import { hoverContentNotPersistentRule } from './hover-content-not-persistent.js';
import { hoverContentNotHoverableRule } from './hover-content-not-hoverable.js';
import { hoverContentNotDismissibleRule } from './hover-content-not-dismissible.js';
import { nonTextContrastRule } from './non-text-contrast.js';
import { contrastOverBackgroundRule } from './contrast-over-background.js';
import { textOverlapRule } from './text-overlap.js';
import { textSpacingClippedRule } from './text-spacing-clipped.js';
import { textResizeClippedRule } from './text-resize-clipped.js';
import { reflowTwoDimensionalRule } from './reflow-two-dimensional.js';
import { reflowHorizontalScrollRule } from './reflow-horizontal-scroll.js';

// `nx g @clear-a11y/workspace-plugin:rule` adds imports above and entries below.
export const rules: RuleMeta[] = [
  orientationLockedRule,
  motionWithoutPauseRule,
  targetSizeRule,
  hoverContentNotPersistentRule,
  hoverContentNotHoverableRule,
  hoverContentNotDismissibleRule,
  nonTextContrastRule,
  contrastOverBackgroundRule,
  textOverlapRule,
  textSpacingClippedRule,
  textResizeClippedRule,
  reflowTwoDimensionalRule,
  reflowHorizontalScrollRule,
];
