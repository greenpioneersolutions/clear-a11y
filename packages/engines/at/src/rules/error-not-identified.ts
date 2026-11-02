import type { RuleMeta } from '@clear-a11y/core';

export const errorNotIdentifiedRule: RuleMeta = {
  id: 'at/error-not-identified',
  engine: 'engine-at',
  wcag: ['3.3.1'],
  tier: 'violation',
  title: 'Error not identified in text',
  description:
    'After a failed submit, a field is marked as invalid only visually (for example a red border) or only with aria-invalid, and no text anywhere says what is wrong. People who cannot see the color change, and screen reader users, are not told which field failed or why.',
  fix: 'Show a text message next to the field that names the problem ("Enter your email address"), link it with aria-describedby, and set aria-invalid="true" on the field.',
};

/** How one field changed when the form was submitted. */
export interface FieldChange {
  selector: string;
  invalidBefore: boolean;
  invalidAfter: boolean;
  /** Border, background or shadow changed (measured only on fields that do not have focus). */
  styleChanged: boolean;
}

export interface ErrorNotIdentifiedInput {
  fields: readonly FieldChange[];
  /** Any readable text appeared or changed anywhere on the page (including live regions). */
  newText: boolean;
  /** The field's accessible name or description changed (e.g. a new aria-describedby). */
  describedChange?: boolean;
}

/** Pure analysis for at/error-not-identified: fields flagged invalid with no text explaining it. */
export function detectErrorNotIdentified(input: ErrorNotIdentifiedInput): FieldChange[] {
  if (input.newText || input.describedChange) return [];
  return input.fields.filter((f) => (f.invalidAfter && !f.invalidBefore) || f.styleChanged);
}
