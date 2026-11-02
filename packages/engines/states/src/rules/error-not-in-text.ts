import type { RuleMeta } from '@clear-a11y/core';

export const errorNotInTextRule: RuleMeta = {
  id: 'states/error-not-in-text',
  engine: 'engine-states',
  wcag: ['3.3.1', '1.4.1'],
  tier: 'likely',
  title: 'Error shown only by colour or styling',
  description:
    'Submitting the form changes how a field looks (for example a red border) or marks it aria-invalid, but no text anywhere on the page says what is wrong. People who cannot see the colour change, and screen reader users, are not told about the error or how to fix it.',
  fix: 'Show a text message for every field in error, next to the field, and link it with aria-describedby (or aria-errormessage). Keep the colour change as an extra cue, not the only one.',
};

/** What the engine saw for one field after submitting its form. */
export interface ErrorNotInTextInput {
  /** New visible text anywhere on the page after submitting. */
  newTextOnPage: number;
  /** The field's border, background, shadow or text colour changed. */
  styleChanged: boolean;
  /** The field has focus (focus styles make style changes unreliable). */
  focused: boolean;
  ariaInvalidBefore: string | null;
  ariaInvalid: string | null;
  /** The browser blocked the submit with native validation bubbles (they are text). */
  nativeInvalid: boolean;
}

/**
 * Pure check for states/error-not-in-text: the field changed to an error look (or became
 * aria-invalid) and no text at all appeared on the page. `likely`, because a style change is a
 * strong but not certain sign of an error state.
 */
export function detectErrorNotInText(input: ErrorNotInTextInput): boolean {
  if (input.nativeInvalid || input.newTextOnPage > 0) return false;
  const becameInvalid = input.ariaInvalid === 'true' && input.ariaInvalidBefore !== 'true';
  return becameInvalid || (input.styleChanged && !input.focused);
}
