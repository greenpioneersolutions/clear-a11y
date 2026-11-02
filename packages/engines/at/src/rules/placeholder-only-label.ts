import type { RuleMeta } from '@clear-a11y/core';

export const placeholderOnlyLabelRule: RuleMeta = {
  id: 'at/placeholder-only-label',
  engine: 'engine-at',
  wcag: ['3.3.2', '1.3.1', '4.1.2'],
  tier: 'likely',
  title: 'Placeholder used as the only label',
  description:
    'A form field has no label; its placeholder text is the only hint. The placeholder disappears as soon as someone types, is often low contrast, and is not reliably read by every screen reader. People with memory or attention difficulties lose track of what the field was for.',
  fix: 'Add a visible <label for="..."> (or wrap the field in a <label>). Keep the placeholder only for an example format, if at all.',
};

const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

export interface PlaceholderOnlyLabelInput {
  /** Role in the accessibility tree. */
  role: string;
  /** Where the accessible name came from (see `nameSourceOf`). */
  nameSource: string;
}

/** Pure analysis for at/placeholder-only-label: a text field whose accessible name comes from its placeholder. */
export function detectPlaceholderOnlyLabel(input: PlaceholderOnlyLabelInput): boolean {
  return TEXT_ROLES.has(input.role) && input.nameSource === 'placeholder';
}
