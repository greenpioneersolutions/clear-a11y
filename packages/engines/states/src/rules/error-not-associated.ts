import type { RuleMeta, Tier } from '@clear-a11y/core';

export const errorNotAssociatedRule: RuleMeta = {
  id: 'states/error-not-associated',
  engine: 'engine-states',
  wcag: ['3.3.1', '1.3.1'],
  tier: 'violation',
  title: 'Error message not associated with its field',
  description:
    'After the form is submitted, an error message appears next to a field, but the field is not marked invalid (aria-invalid) and the message is not linked to it (aria-describedby or aria-errormessage). Screen reader users who move to the field hear nothing about the error, so they cannot tell which field is wrong or why.',
  fix: 'When a field fails validation, set aria-invalid="true" on it and point aria-describedby (or aria-errormessage) at the element that holds the message. Remove both when the error is fixed.',
};

/** What the engine saw for one field after submitting its form. */
export interface ErrorAssociationInput {
  /** aria-invalid after submitting. */
  ariaInvalid: string | null;
  /** Text that appeared in the field's own container, and whether the field references it. */
  texts: readonly { text: string; associated: boolean }[];
}

/**
 * Pure check for states/error-not-associated. Returns the tier when the barrier is present:
 * - `violation`: visible error text appeared next to the field and nothing programmatic ties it to
 *   the field (no aria-invalid, no aria-describedby/aria-errormessage/label containing the text).
 * - `likely`: the field is marked aria-invalid but the new message is not linked to it, so users
 *   learn that the field is wrong but not why.
 */
export function detectErrorNotAssociated(input: ErrorAssociationInput): Tier | undefined {
  const messages = input.texts.filter((t) => t.text.trim() !== '');
  if (messages.length === 0) return undefined;
  if (messages.some((t) => t.associated)) return undefined;
  return input.ariaInvalid === 'true' ? 'likely' : 'violation';
}
