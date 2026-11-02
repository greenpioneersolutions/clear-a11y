import type { PageContext } from '@clear-a11y/browser';
import { ensureToolkit } from './page-toolkit.js';
import { quote, type Judge } from './types.js';

/** Runs only where error messages are on screen: form-invalid states from the state explorer. */
export function isFormInvalidState(ctx: Pick<PageContext, 'state' | 'stateMeta'>): boolean {
  return ctx.stateMeta?.kind === 'form-invalid' || ctx.state.startsWith('form-invalid');
}

export interface RawError {
  selector: string;
  errorText: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  constraints: Record<string, string>;
  formHeading: string;
  html: string;
}

/** One candidate per distinct error element; empty texts dropped. */
export function dedupeErrors(errors: readonly RawError[], limit: number): RawError[] {
  const seen = new Set<string>();
  const out: RawError[] = [];
  for (const e of errors) {
    if (!e.errorText || seen.has(e.selector)) continue;
    seen.add(e.selector);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export const errorClarityJudge: Judge = {
  id: 'error-clarity',
  wcag: ['3.3.3'],
  title: 'Error message does not say how to fix the input',
  promptVersion: 1,
  fix: 'Say what is wrong and how to fix it, in words: "Enter a date in the format DD/MM/YYYY", not "Invalid input" or "Error 42".',
  runsIn: isFormInvalidState,
  async select(ctx, { limit }) {
    await ensureToolkit(ctx.page);
    const raw = await ctx.page.evaluate((): RawError[] => {
      const h = window.__clearA11y!;
      const t = window.__clearA11yAi!;
      const visible = (el: Element) => h.isVisible(el) && !t.hidden(el);
      const out: RawError[] = [];
      const fieldInfo = (field: Element | null) => {
        if (!field) return { fieldLabel: '', fieldType: '', required: false, constraints: {} };
        const constraints: Record<string, string> = {};
        for (const a of [
          'type',
          'pattern',
          'minlength',
          'maxlength',
          'min',
          'max',
          'inputmode',
          'autocomplete',
        ]) {
          const v = field.getAttribute(a);
          if (v) constraints[a] = v.slice(0, 80);
        }
        return {
          fieldLabel: t.name(field),
          fieldType: field.getAttribute('type') ?? field.tagName.toLowerCase(),
          required:
            field.hasAttribute('required') || field.getAttribute('aria-required') === 'true',
          constraints,
        };
      };
      const push = (el: Element, field: Element | null) => {
        if (!visible(el)) return;
        const form = el.closest('form');
        out.push({
          selector: h.selector(el),
          errorText: t.clean((el as HTMLElement).innerText, 300),
          ...fieldInfo(field),
          formHeading: form ? t.headingBefore(form) : t.headingBefore(el),
          html: h.snippet(el),
        });
      };
      // 1. Messages tied to invalid fields.
      for (const field of Array.from(document.querySelectorAll('[aria-invalid=true]'))) {
        const ids = `${field.getAttribute('aria-errormessage') ?? ''} ${field.getAttribute('aria-describedby') ?? ''}`;
        for (const id of ids.split(/\s+/).filter(Boolean)) {
          const msg = document.getElementById(id);
          if (msg) push(msg, field);
        }
      }
      // 2. Alerts and elements that look like error messages, matched to a nearby field.
      const looksLikeError = Array.from(
        document.querySelectorAll(
          '[role=alert], [aria-live=assertive], [id*=error i], [class*=error i], [class*=invalid i], [id*=invalid i]',
        ),
      ).filter((el) => !el.matches('input, select, textarea, form, fieldset'));
      for (const el of looksLikeError) {
        if ((el as HTMLElement).innerText?.trim().length > 300) continue;
        const scope = el.closest('.field, .form-group, p, div, li, fieldset');
        push(el, scope?.querySelector('input, select, textarea') ?? null);
      }
      return out;
    });
    return dedupeErrors(raw, limit).map((e) => ({
      selector: e.selector,
      name: e.errorText,
      html: e.html,
      input: {
        errorText: e.errorText,
        fieldLabel: e.fieldLabel,
        fieldType: e.fieldType,
        required: e.required,
        constraints: e.constraints,
        formHeading: e.formHeading,
      },
    }));
  },
  subject: () => 'This error message',
  failMessage: (c, v) =>
    `The error message ${quote(c.input['errorText'])} does not tell people what went wrong or how to fix it: ${v.reason} People with cognitive disabilities and screen reader users get stuck on the form.`,
  question: (c) =>
    `Does the error message ${quote(c.input['errorText'])} say what is wrong with the ${c.input['fieldLabel'] ? quote(c.input['fieldLabel'], 40) : 'field'} input and how to correct it?`,
};
