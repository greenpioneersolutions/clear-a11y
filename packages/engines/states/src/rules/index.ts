import type { RuleMeta } from '@clear-a11y/core';
import { contextChangeOnInputRule } from './context-change-on-input.js';
import { expandedStateMismatchRule } from './expanded-state-mismatch.js';
import { errorNotInTextRule } from './error-not-in-text.js';
import { errorNotAssociatedRule } from './error-not-associated.js';

// `nx g @clear-a11y/workspace-plugin:rule` adds imports above and entries below.
export const rules: RuleMeta[] = [
  contextChangeOnInputRule,
  expandedStateMismatchRule,
  errorNotInTextRule,
  errorNotAssociatedRule,
];
