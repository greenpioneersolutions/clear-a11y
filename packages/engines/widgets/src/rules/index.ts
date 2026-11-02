import type { RuleMeta } from '@clear-a11y/core';
import { gridKeyboardRule } from './grid-keyboard.js';
import { disclosureKeyboardRule } from './disclosure-keyboard.js';
import { dialogInitialFocusRule } from './dialog-initial-focus.js';
import { listboxKeyboardRule } from './listbox-keyboard.js';
import { comboboxKeyboardRule } from './combobox-keyboard.js';
import { menuKeyboardRule } from './menu-keyboard.js';
import { tabsSelectedStateRule } from './tabs-selected-state.js';
import { tabsKeyboardRule } from './tabs-keyboard.js';

// `nx g @clear-a11y/workspace-plugin:rule` adds imports above and entries below.
export const rules: RuleMeta[] = [
  gridKeyboardRule,
  disclosureKeyboardRule,
  dialogInitialFocusRule,
  listboxKeyboardRule,
  comboboxKeyboardRule,
  menuKeyboardRule,
  tabsSelectedStateRule,
  tabsKeyboardRule,
];
