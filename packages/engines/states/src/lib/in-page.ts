/**
 * Functions that run inside the page via `page.evaluate`. Each one must be self-contained: no
 * imports and no references to module scope. They expect `ensureHelpers(page)` to have run.
 */
import type { PageHelpers } from '@clear-a11y/browser';
import type { Candidate, Revealed } from './classify.js';
import type { FieldInfo } from './invalid-value.js';
import type { Snapshot } from './visible-set-diff.js';

interface StateRegistry {
  ids: WeakMap<Element, number>;
  els: Map<number, Element>;
  next: number;
  styles: Record<string, string>;
  invalid: Record<string, string | null>;
}

declare global {
  interface Window {
    __clearA11yStates?: StateRegistry;
  }
}

export interface FormInfo {
  selector: string;
  /** id or name of the form, for the state id. */
  id: string;
  submit: string;
  submitName: string;
  noValidate: boolean;
  fields: FieldInfo[];
}

export interface CandidateList {
  candidates: Candidate[];
  /** Controls that were not touched because their name looks destructive. */
  skipped: { selector: string; name: string }[];
}

export interface NewTextObservation {
  selector: string;
  text: string;
  /** Inside (or containing) an element the field references with aria-describedby/aria-errormessage, or inside its label. */
  associated: boolean;
}

export interface FieldObservation {
  selector: string;
  /** Label text (or another approximate accessible name). */
  name: string;
  ariaInvalidBefore: string | null;
  ariaInvalid: string | null;
  describedBy: string;
  errorMessage: string;
  focused: boolean;
  /** Border, background, shadow or text colour of the field changed after submitting. */
  styleChanged: boolean;
  /** New text that appeared in the field's own container (label, hint and message area). */
  texts: NewTextObservation[];
  html: string;
}

export interface ExpandedProbe {
  expanded: string | null;
  controls: string | null;
  /** Visibility of the element named by aria-controls (null when there is none). */
  controlledVisible: boolean | null;
}

/** Visible elements and the elements with their own text, keyed by a per-document id. */
export function pageSnapshot(max: number): Snapshot {
  const S = (window.__clearA11yStates ??= {
    ids: new WeakMap(),
    els: new Map(),
    next: 1,
    styles: {},
    invalid: {},
  });
  const keyOf = (el: Element): number => {
    let k = S.ids.get(el);
    if (!k) {
      k = S.next++;
      S.ids.set(el, k);
      S.els.set(k, el);
    }
    return k;
  };
  const skip = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'WBR']);
  const visible: [number, number][] = [];
  const texts: [number, string][] = [];
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (let i = 0; i < all.length && visible.length < max; i++) {
    const el = all[i] as Element;
    if (skip.has(el.tagName)) continue;
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const k = keyOf(el);
    visible.push([k, el.parentElement ? keyOf(el.parentElement) : 0]);
    let own = '';
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) own += n.textContent ?? '';
    own = own.replace(/\s+/g, ' ').trim();
    if (own) texts.push([k, own.slice(0, 200)]);
  }
  return { visible, texts };
}

/** Describes revealed subtree roots by their snapshot keys. */
export function describeKeys(keys: number[]): Revealed[] {
  const S = window.__clearA11yStates;
  const H = window.__clearA11y as PageHelpers; // installed by ensureHelpers
  const out: Revealed[] = [];
  const selfOrInside = (el: Element, sel: string) => (el.matches(sel) ? el : el.querySelector(sel));
  for (const k of keys) {
    const el = S?.els.get(k);
    if (!el || !el.isConnected) continue;
    const dialog = selfOrInside(el, 'dialog[open], [role="dialog"], [role="alertdialog"]');
    const interactiveSel =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    out.push({
      selector: H.selector(el),
      id: el.id,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') ?? '',
      textLength: (el.textContent ?? '').replace(/\s+/g, ' ').trim().length,
      links: el.querySelectorAll('a[href]').length + (el.matches('a[href]') ? 1 : 0),
      interactive:
        el.querySelectorAll(interactiveSel).length + (el.matches(interactiveSel) ? 1 : 0),
      dialog: Boolean(dialog),
      dialogId: dialog?.id ?? '',
      menu: Boolean(selfOrInside(el, '[role="menu"], [role="menubar"], [role="listbox"]')),
      tabpanel: Boolean(selfOrInside(el, '[role="tabpanel"]')),
      tooltip: Boolean(selfOrInside(el, '[role="tooltip"]')),
      popover: el.hasAttribute('popover'),
      navLike: Boolean(selfOrInside(el, 'nav, ul, ol, [role="navigation"]')),
      inDetails: Boolean(el.closest('details[open]')) && el.tagName !== 'DETAILS',
    });
  }
  return out;
}

/** Controls worth activating, in priority order. Never returns links to other documents. */
export function collectCandidates(args: { max: number; destructive: string }): CandidateList {
  const H = window.__clearA11y as PageHelpers; // installed by ensureHelpers
  const destructive = new RegExp(args.destructive, 'i');
  const nameOf = (el: Element): string => {
    const label = el.getAttribute('aria-label')?.trim();
    if (label) return label;
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const t = ids
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (t) return t;
    }
    if (el instanceof HTMLInputElement) {
      return (el.value || el.labels?.[0]?.textContent || '').replace(/\s+/g, ' ').trim();
    }
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 80) : (el.getAttribute('title') ?? '').trim();
  };
  const sameDocument = (href: string): boolean => {
    try {
      const u = new URL(href, location.href);
      return (
        u.origin === location.origin &&
        u.pathname === location.pathname &&
        u.search === location.search
      );
    } catch {
      return false;
    }
  };
  const visible = (el: Element): boolean => {
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const order = { toggle: 0, summary: 1, tab: 2, button: 3, tooltip: 4 } as const;
  const candidates: Candidate[] = [];
  const skipped: CandidateList['skipped'] = [];
  const seen = new Set<string>();
  const all = document.body ? Array.from(document.body.querySelectorAll('*')) : [];
  for (const el of all) {
    if (!(el instanceof HTMLElement) || el.tagName === 'IFRAME') continue;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') ?? '';
    const has = (a: string) => el.hasAttribute(a);
    const toggleData = el
      .getAttributeNames()
      .some((n) => n.startsWith('data-') && n.includes('toggle'));
    let reason: Candidate['reason'] | undefined;
    if (tag === 'summary' && el.parentElement instanceof HTMLDetailsElement) {
      reason = el.parentElement.open ? undefined : 'summary';
    } else if (role === 'tab') {
      reason = el.getAttribute('aria-selected') === 'true' ? undefined : 'tab';
    } else if (
      has('aria-expanded') ||
      has('aria-haspopup') ||
      has('aria-controls') ||
      has('popovertarget') ||
      toggleData
    ) {
      reason = el.getAttribute('aria-expanded') === 'true' ? undefined : 'toggle';
    } else if (el.getAttribute('title')?.trim() || has('aria-describedby')) {
      reason = 'tooltip';
    } else if (tag === 'button' || role === 'button') {
      reason = 'button';
    }
    if (!reason) continue;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const formOwner = (el as HTMLButtonElement | HTMLInputElement).form;
    const type = (el as HTMLButtonElement | HTMLInputElement).type;
    if (
      formOwner &&
      ((tag === 'button' && type === 'submit') ||
        (tag === 'input' && (type === 'submit' || type === 'image')))
    )
      continue; // form submission is explored separately
    const isField = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (isField && reason !== 'tooltip' && reason !== 'toggle') continue;
    if (tag === 'a' && has('href') && !sameDocument(el.getAttribute('href') ?? '')) continue;
    if (!visible(el)) continue;
    const selector = H.selector(el);
    if (seen.has(selector)) continue;
    seen.add(selector);
    const name = nameOf(el);
    if (destructive.test(name)) {
      skipped.push({ selector, name });
      continue;
    }
    const attr = (a: string) => el.getAttribute(a) ?? undefined;
    candidates.push({
      selector,
      reason,
      name,
      tag,
      role,
      id: el.id,
      expanded: attr('aria-expanded'),
      // A summary controls its <details>.
      controls:
        attr('aria-controls') ??
        (reason === 'summary' ? el.parentElement?.id || undefined : undefined),
      haspopup: attr('aria-haspopup'),
      popovertarget: attr('popovertarget'),
      inHeading: Boolean(el.closest('h1, h2, h3, h4, h5, h6, [role="heading"]')),
      clickable:
        !isField &&
        (reason !== 'tooltip' ||
          tag === 'button' ||
          tag === 'summary' ||
          role === 'button' ||
          (tag === 'a' && has('href'))),
    });
  }
  candidates.sort((a, b) => order[a.reason] - order[b.reason]);
  return { candidates: candidates.slice(0, args.max), skipped };
}

/** Visible forms that have a submit control whose name is not destructive. */
export function collectForms(args: { max: number; destructive: string }): {
  forms: FormInfo[];
  skipped: { selector: string; name: string }[];
} {
  const H = window.__clearA11y as PageHelpers; // installed by ensureHelpers
  const destructive = new RegExp(args.destructive, 'i');
  const visible = (el: Element): boolean => {
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const forms: FormInfo[] = [];
  const skipped: { selector: string; name: string }[] = [];
  for (const form of Array.from(document.forms)) {
    if (forms.length >= args.max) break;
    if (!visible(form) || form.method === 'dialog') continue;
    const elements = Array.from(form.elements) as HTMLElement[];
    const submit = elements.find(
      (e) =>
        (e instanceof HTMLButtonElement && e.type === 'submit') ||
        (e instanceof HTMLInputElement && (e.type === 'submit' || e.type === 'image')),
    ) as HTMLButtonElement | HTMLInputElement | undefined;
    if (!submit || !visible(submit) || submit.disabled) continue;
    const submitName = (
      submit.getAttribute('aria-label') ||
      (submit instanceof HTMLInputElement ? submit.value : submit.textContent) ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (destructive.test(submitName)) {
      skipped.push({ selector: H.selector(submit), name: submitName });
      continue;
    }
    const fields: FieldInfo[] = [];
    for (const e of elements) {
      const isInput = e instanceof HTMLInputElement;
      if (!isInput && !(e instanceof HTMLSelectElement) && !(e instanceof HTMLTextAreaElement))
        continue;
      if (
        isInput &&
        ['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(e.type.toLowerCase())
      )
        continue;
      if (!visible(e) || (e as HTMLInputElement).disabled) continue;
      const input = e as HTMLInputElement;
      const min = input.getAttribute('min');
      const max = input.getAttribute('max');
      const pattern = input.getAttribute('pattern');
      fields.push({
        selector: H.selector(e),
        tag: e.tagName.toLowerCase(),
        type: isInput ? input.type.toLowerCase() : e.tagName.toLowerCase(),
        required: input.required,
        ...(input.minLength > 0 ? { minLength: input.minLength } : {}),
        ...(input.maxLength > 0 ? { maxLength: input.maxLength } : {}),
        ...(min !== null ? { min } : {}),
        ...(max !== null ? { max } : {}),
        ...(pattern ? { pattern } : {}),
      });
    }
    if (fields.length === 0) continue;
    forms.push({
      selector: H.selector(form),
      id: form.id || form.getAttribute('name') || '',
      submit: H.selector(submit),
      submitName,
      noValidate: form.noValidate,
      fields,
    });
  }
  return { forms, skipped };
}

/**
 * Records (phase "before") or compares (phase "after") the state of form fields around a submit.
 * In the "after" phase, `newTextKeys` are snapshot keys of elements whose text appeared.
 */
export function observeFields(args: {
  fields: string[];
  phase: 'before' | 'after';
  newTextKeys: number[];
}): FieldObservation[] {
  const S = window.__clearA11yStates as StateRegistry; // created by pageSnapshot
  const H = window.__clearA11y as PageHelpers; // installed by ensureHelpers
  const controlSel =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';
  const containerOf = (el: Element): Element => {
    const form = (el as HTMLInputElement).form;
    let c = el;
    while (c.parentElement && c.parentElement !== form && c.parentElement !== document.body) {
      if (c.parentElement.querySelectorAll(controlSel).length > 1) break;
      c = c.parentElement;
    }
    return c;
  };
  const styleSig = (el: Element): string => {
    const s = getComputedStyle(el);
    return [
      s.borderTopColor,
      s.borderRightColor,
      s.borderBottomColor,
      s.borderLeftColor,
      s.borderTopWidth,
      s.backgroundColor,
      s.boxShadow,
      s.color,
    ].join('|');
  };
  const out: FieldObservation[] = [];
  for (const sel of args.fields) {
    const el = document.querySelector(sel) as HTMLInputElement | null;
    if (!el) continue;
    if (args.phase === 'before') {
      S.styles[sel] = styleSig(el);
      S.invalid[sel] = el.getAttribute('aria-invalid');
      continue;
    }
    const refIds = [
      ...(el.getAttribute('aria-describedby') ?? '').split(/\s+/),
      ...(el.getAttribute('aria-errormessage') ?? '').split(/\s+/),
    ].filter(Boolean);
    const refs = refIds
      .map((id) => document.getElementById(id))
      .filter((r): r is HTMLElement => r !== null);
    const labels = Array.from(el.labels ?? []);
    const container = containerOf(el);
    const texts: NewTextObservation[] = [];
    for (const k of args.newTextKeys) {
      const t = S.els.get(k);
      if (!t || !t.isConnected || !container.contains(t) || labels.some((l) => l === t)) continue;
      // Text inside the field's own label that was already there is not new; new label text is.
      texts.push({
        selector: H.selector(t),
        text: (t.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
        associated:
          refs.some((r) => r.contains(t) || t.contains(r)) || labels.some((l) => l.contains(t)),
      });
    }
    out.push({
      selector: sel,
      name: (labels[0]?.textContent ?? el.getAttribute('aria-label') ?? el.name ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      ariaInvalidBefore: S.invalid[sel] ?? null,
      ariaInvalid: el.getAttribute('aria-invalid'),
      describedBy: el.getAttribute('aria-describedby') ?? '',
      errorMessage: el.getAttribute('aria-errormessage') ?? '',
      focused: document.activeElement === el,
      styleChanged: S.styles[sel] !== undefined && S.styles[sel] !== styleSig(el),
      texts,
      html: H.snippet(el),
    });
  }
  return out;
}

/** aria-expanded of a trigger and the visibility of the element it controls. */
export function expandedProbe(selector: string): ExpandedProbe {
  const el = document.querySelector(selector);
  const expanded = el?.getAttribute('aria-expanded') ?? null;
  const controls = el?.getAttribute('aria-controls')?.trim() || null;
  const target = controls ? document.getElementById(controls.split(/\s+/)[0] ?? '') : null;
  let controlledVisible: boolean | null = null;
  if (target) {
    const r = target.getBoundingClientRect();
    controlledVisible =
      (typeof target.checkVisibility !== 'function' ||
        target.checkVisibility({ opacityProperty: true, visibilityProperty: true })) &&
      r.width > 0 &&
      r.height > 0;
  }
  return { expanded, controls, controlledVisible };
}

/** The form has fields failing native constraint validation (browser bubbles, no DOM). */
export function hasNativeInvalid(formSelector: string): boolean {
  const form = document.querySelector(formSelector) as HTMLFormElement | null;
  return Boolean(form && !form.noValidate && form.querySelector(':invalid'));
}
