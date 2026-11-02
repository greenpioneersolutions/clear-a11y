import type { RuleMeta } from '@clear-a11y/core';

export const roleMissingRule: RuleMeta = {
  id: 'at/role-missing',
  engine: 'engine-at',
  wcag: ['4.1.2'],
  tier: 'likely',
  title: 'Interactive element without a role',
  description:
    'An element can be focused with Tab and reacts to clicks, but it has no interactive role. Screen readers announce it as plain text ("Delete" instead of "Delete, button"), so people do not know they can activate it.',
  fix: 'Use a real <button> (or <a href> for navigation). If you must keep the element, add role="button" and make Enter and Space activate it.',
};

/** Roles that already tell assistive technology the element is operable. */
export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'combobox',
  'textbox',
  'searchbox',
  'slider',
  'spinbutton',
  'scrollbar',
  'treeitem',
  'gridcell',
  'row',
  'columnheader',
  'rowheader',
  'listbox',
  'menu',
  'menubar',
  'tablist',
  'tree',
  'grid',
  'treegrid',
  'radiogroup',
  'tabpanel',
  'dialog',
  'alertdialog',
  'application',
  'DisclosureTriangle',
  'Video',
  'Audio',
]);

/** Event types that make an element behave like a control when pressed. */
const ACTIVATION_EVENTS = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']);

export interface RoleMissingInput {
  /** Role in the accessibility tree (e.g. "generic" for a div). */
  axRole: string;
  /** The element's tabIndex (>= 0 means it's in the Tab sequence). */
  tabIndex: number;
  /** True for native controls (button, a[href], input, select, textarea, summary...). */
  nativeControl: boolean;
  /** Event listener types attached directly to the element. */
  listenerTypes: readonly string[];
}

/**
 * Pure analysis for at/role-missing: focusable, has a click-like listener of its own, and the
 * accessibility tree exposes no interactive role.
 */
export function detectRoleMissing(input: RoleMissingInput): boolean {
  if (input.nativeControl || input.tabIndex < 0) return false;
  if (INTERACTIVE_ROLES.has(input.axRole)) return false;
  return input.listenerTypes.some((t) => ACTIVATION_EVENTS.has(t));
}
