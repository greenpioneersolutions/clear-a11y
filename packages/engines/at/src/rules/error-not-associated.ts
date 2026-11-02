import type { RuleMeta } from '@clear-a11y/core';
import { normalizeName } from '../lib/normalize-name.js';

export const errorNotAssociatedRule: RuleMeta = {
  id: 'at/error-not-associated',
  engine: 'engine-at',
  wcag: ['3.3.1', '1.3.1'],
  tier: 'likely',
  title: 'Error message not associated with its field',
  description:
    'An error message appears next to a field after a failed submit, but it is not part of the field\'s accessible name or description. When a screen reader user moves to the field, they hear "Email, edit text" and never the error.',
  fix: 'Give the error element an id and reference it from the field with aria-describedby (or aria-errormessage together with aria-invalid="true"). Set aria-invalid="true" on the field while it is in error.',
};

export interface ErrorNotAssociatedInput {
  /** The error text shown next to the field. */
  errorText: string;
  /** What assistive technology exposes for the field: its accessible name plus description. */
  exposedText: string;
}

/** Pure analysis for at/error-not-associated: the error text is not in the field's name or description. */
export function detectErrorNotAssociated(input: ErrorNotAssociatedInput): boolean {
  const error = normalizeName(input.errorText);
  if (!error) return false;
  return !normalizeName(input.exposedText).includes(error);
}
