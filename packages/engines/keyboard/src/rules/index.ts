import type { RuleMeta } from '@clear-a11y/core';
import { contextChangeOnFocusRule } from './context-change-on-focus.js';
import { skipLinkMissingRule } from './skip-link-missing.js';
import { skipLinkBrokenRule } from './skip-link-broken.js';
import { overlayFocusNotMovedRule } from './overlay-focus-not-moved.js';
import { focusNotReturnedRule } from './focus-not-returned.js';
import { escapeDoesNotCloseRule } from './escape-does-not-close.js';
import { clickNotFocusableRule } from './click-not-focusable.js';
import { keyboardTrapRule } from './keyboard-trap.js';
import { focusObscuredRule } from './focus-obscured.js';
import { focusNotVisibleRule } from './focus-not-visible.js';
import { focusOrderBackwardRule } from './focus-order-backward.js';

// `nx g @clear-a11y/workspace-plugin:rule` adds imports above and entries below.
export const rules: RuleMeta[] = [
  contextChangeOnFocusRule,
  skipLinkMissingRule,
  skipLinkBrokenRule,
  overlayFocusNotMovedRule,
  focusNotReturnedRule,
  escapeDoesNotCloseRule,
  clickNotFocusableRule,
  keyboardTrapRule,
  focusObscuredRule,
  focusNotVisibleRule,
  focusOrderBackwardRule,
];
