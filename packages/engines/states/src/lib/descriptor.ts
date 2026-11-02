import type { Page } from '@clear-a11y/browser';

export const STATE_KINDS = [
  'menu',
  'dialog',
  'accordion',
  'tab',
  'tooltip',
  'disclosure',
  'popover',
  'form-empty',
  'form-invalid',
] as const;
export type StateKind = (typeof STATE_KINDS)[number];

/** How a state is reached from a freshly loaded page. */
export type StateAction =
  | { type: 'click'; selector: string }
  | { type: 'hover'; selector: string }
  | { type: 'focus'; selector: string }
  | {
      type: 'submit';
      form: string;
      submit: string;
      /** Values typed into fields before submitting (form-invalid). Selector -> value. */
      fill: Record<string, string>;
    };

/** A hidden state of a page that engines should also test, plus how to re-open it. */
export interface StateDescriptor {
  /** Stable id, e.g. "dialog:open#settings-dialog", "form-invalid#signup". */
  id: string;
  kind: StateKind;
  /** Selector of the control that opens the state (the submit button for forms). */
  trigger: string;
  /** Human description for reports. */
  label: string;
  action: StateAction;
  /** Selectors of the content the state reveals (used by `verify`). */
  content: string[];
  /** Re-creates the state on a freshly loaded page of the same URL. */
  open(page: Page): Promise<void>;
  /** True when the state really is open on `page`. */
  verify(page: Page): Promise<boolean>;
}
