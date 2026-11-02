import type { Page } from '@clear-a11y/browser';
import type { StateAction } from './descriptor.js';
import {
  describeKeys,
  hasNativeInvalid,
  observeFields,
  type FieldObservation,
  type FormInfo,
} from './in-page.js';
import { invalidValueFor } from './invalid-value.js';
import type { StatesOptions } from './options.js';
import { performAction, snapshot } from './actions.js';
import { sameDocument } from './safety.js';
import { newTexts } from './visible-set-diff.js';

export type FormMode = 'empty' | 'invalid';

const CLEARABLE = new Set(['text', 'search', 'tel', 'password', 'email', 'url', 'number']);

/** The submit action for a form in a mode, or undefined when no field can be made invalid. */
export function formAction(
  form: FormInfo,
  mode: FormMode,
): Extract<StateAction, { type: 'submit' }> | undefined {
  const fill: Record<string, string> = {};
  if (mode === 'empty') {
    // Clear prefilled text so "empty" really is empty.
    for (const field of form.fields) {
      if (field.tag === 'textarea' || (field.tag === 'input' && CLEARABLE.has(field.type))) {
        fill[field.selector] = '';
      }
    }
  } else {
    for (const field of form.fields) {
      const value = invalidValueFor(field);
      if (value !== undefined) fill[field.selector] = value;
    }
    if (Object.keys(fill).length === 0) return undefined;
  }
  return { type: 'submit', form: form.selector, submit: form.submit, fill };
}

export interface SubmitObservation {
  /** Selectors of elements whose text appeared anywhere on the page. */
  textSelectors: string[];
  /** Per-field observations (new text near the field, aria-invalid, style changes). */
  fields: FieldObservation[];
  /** Submission was blocked by native constraint validation (bubbles are browser UI, not DOM). */
  nativeInvalid: boolean;
  /** The page navigated away (the submit was not handled in the page). */
  navigated: boolean;
}

/** Submits `form` on a freshly loaded page and records what changed. */
export async function submitAndObserve(
  page: Page,
  url: string,
  form: FormInfo,
  action: Extract<StateAction, { type: 'submit' }>,
  opts: StatesOptions,
): Promise<SubmitObservation> {
  const fieldSelectors = form.fields.map((f) => f.selector);
  const before = await snapshot(page, opts.maxElements);
  await page.evaluate(observeFields, {
    fields: fieldSelectors,
    phase: 'before' as const,
    newTextKeys: [] as number[],
  });
  await performAction(page, action, opts).catch(() => undefined);
  if (!sameDocument(page.url(), url)) {
    return { textSelectors: [], fields: [], nativeInvalid: false, navigated: true };
  }
  const after = await snapshot(page, opts.maxElements);
  const appeared = newTexts(before.texts, after.texts);
  const keys = appeared.map(([k]) => k);
  const fields = await page.evaluate(observeFields, {
    fields: fieldSelectors,
    phase: 'after' as const,
    newTextKeys: keys,
  });
  const described = keys.length ? await page.evaluate(describeKeys, keys.slice(0, 20)) : [];
  return {
    textSelectors: described.map((d) => d.selector),
    fields,
    // Without novalidate, an invalid form blocks the submit event and shows browser bubbles.
    nativeInvalid: await page.evaluate(hasNativeInvalid, form.selector).catch(() => false),
    navigated: false,
  };
}
