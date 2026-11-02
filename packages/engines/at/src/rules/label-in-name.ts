import type { RuleMeta } from '@clear-a11y/core';
import { hasReadableText, nameContainsLabel } from '../lib/normalize-name.js';

export const labelInNameRule: RuleMeta = {
  id: 'at/label-in-name',
  engine: 'engine-at',
  wcag: ['2.5.3'],
  tier: 'likely',
  title: 'Visible label not in accessible name',
  description:
    'A control shows one label on screen, but aria-label or aria-labelledby gives it a different accessible name. Speech-input users say what they see ("click Search") and nothing happens; screen reader users hear words that do not match the screen.',
  fix: 'Make the accessible name start with (or at least contain) the visible text, or remove the aria-label so the visible text becomes the name. Example: visible "Search" with aria-label="Search products".',
};

/** Roles whose visible label speech-input users would say. */
const LABELLED_ROLES = new Set([
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
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton',
  'slider',
]);

export interface LabelInNameInput {
  role: string;
  /** Computed accessible name. */
  name: string;
  /** Where the name came from (see `nameSourceOf`). */
  nameSource: string;
  /** The text a sighted user sees as the label (the control's text, or its <label>). */
  visibleLabel: string;
}

/**
 * Pure analysis for at/label-in-name. Only author-supplied names (aria-label, aria-labelledby)
 * can drift from the visible text. Icon-only controls and one-character symbols ("X", "+") are
 * skipped: whether their name fits is a judgment call for the AI layer.
 */
export function detectLabelInName(input: LabelInNameInput): boolean {
  if (!LABELLED_ROLES.has(input.role)) return false;
  if (input.nameSource !== 'aria-label' && input.nameSource !== 'aria-labelledby') return false;
  const label = input.visibleLabel.replace(/\s+/g, ' ').trim();
  if (label.length < 2 || label.length > 120 || !hasReadableText(label)) return false;
  return !nameContainsLabel(input.name, label);
}
