/**
 * Functions that run inside the page via `page.evaluate`. Each one must be self-contained: no
 * imports and no references to module scope (they are serialized with `toString`). They rely on
 * `window.__clearA11y` from `ensureHelpers(page)`. Small copies of engine-keyboard's helpers:
 * engines never import each other.
 */
import type { FocusedInfo } from './types.js';

interface PersonaWindow {
  __clearA11yPersona?: { mutations: number };
}

/** Counts DOM mutations so the executor can tell whether an action did anything. Idempotent. */
export function installMutationCounter(): void {
  const w = window as unknown as PersonaWindow;
  if (w.__clearA11yPersona) return;
  const state = { mutations: 0 };
  w.__clearA11yPersona = state;
  new MutationObserver((records) => {
    state.mutations += records.length;
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
}

/** Mutations since the counter was installed; -1 when it isn't (a new document was loaded). */
export function readMutations(): number {
  return (window as unknown as PersonaWindow).__clearA11yPersona?.mutations ?? -1;
}

/** The focused element as a keyboard user experiences it, or null when focus is on the body. */
export function describeFocused(): FocusedInfo | null {
  const h = window.__clearA11y;
  if (!h) throw new Error('helpers not installed');
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const nameOf = (e: Element): string => {
    const labels = (e as HTMLInputElement).labels;
    if (labels && labels.length) {
      const t = clean(Array.from(labels, (l) => l.innerText || l.textContent).join(' '));
      if (t) return t;
    }
    const text = clean((e as HTMLElement).innerText ?? e.textContent);
    if (text && !/^(input|select|textarea)$/i.test(e.tagName)) return text;
    const by = e.getAttribute('aria-labelledby');
    if (by) {
      const t = clean(
        by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' '),
      );
      if (t) return t;
    }
    return clean(
      e.getAttribute('aria-label') ??
        e.getAttribute('title') ??
        e.getAttribute('alt') ??
        e.getAttribute('placeholder') ??
        (e as HTMLInputElement).value,
    );
  };
  const roleOf = (e: Element): string => {
    const explicit = e.getAttribute('role');
    if (explicit) return explicit.split(/\s+/)[0] as string;
    const tag = e.tagName.toLowerCase();
    if (tag === 'a' && e.hasAttribute('href')) return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (e as HTMLInputElement).type;
      if (type === 'checkbox' || type === 'radio') return type;
      if (type === 'range') return 'slider';
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      return 'textbox';
    }
    return tag;
  };
  const input = el as HTMLInputElement;
  const state = [
    'checked' in input && (input.type === 'checkbox' || input.type === 'radio')
      ? `checked=${input.checked}`
      : '',
    el.getAttribute('aria-checked') ? `aria-checked=${el.getAttribute('aria-checked')}` : '',
    el.getAttribute('aria-expanded') ? `expanded=${el.getAttribute('aria-expanded')}` : '',
    el.getAttribute('aria-pressed') ? `pressed=${el.getAttribute('aria-pressed')}` : '',
    'value' in input && typeof input.value === 'string' ? `value=${input.value.length}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const r = el.getBoundingClientRect();
  return {
    selector: h.selector(el),
    role: roleOf(el),
    name: nameOf(el).slice(0, 120),
    tag: el.tagName.toLowerCase(),
    state,
    visible: h.isVisible(el),
    rect: { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height },
  };
}

/** Visible text on screen, one line per rendered line, plus visible fields' labels. Capped. */
export function screenText(max: number): string[] {
  const lines = (document.body?.innerText ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((l) => (l.length > 120 ? `${l.slice(0, 119)}…` : l));
  const h = window.__clearA11y;
  for (const f of Array.from(document.querySelectorAll('input, select, textarea'))) {
    if (h && !h.isVisible(f)) continue;
    const hint = f.getAttribute('placeholder') ?? '';
    if (hint) lines.push(`[field: ${hint.slice(0, 80)}]`);
  }
  return lines.slice(0, max);
}

export interface VisibleMatch {
  selector: string;
  role: string;
  name: string;
  tag: string;
}

/**
 * The visible element whose text best matches the hint name (shortest matching text, deepest
 * element). Used only to point a finding at the blocking element (a sighted cross-check), never
 * to steer a persona.
 */
export function findVisibleByName(q: { name?: string; namePattern?: string }): VisibleMatch | null {
  const h = window.__clearA11y;
  if (!h) throw new Error('helpers not installed');
  const norm = (s: string | null | undefined) =>
    (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const matches = (text: string) => {
    if (!text) return false;
    if (q.name && !text.includes(norm(q.name))) return false;
    if (q.namePattern && !new RegExp(q.namePattern, 'i').test(text)) return false;
    return Boolean(q.name || q.namePattern);
  };
  const textOf = (e: Element) =>
    norm(
      (e as HTMLElement).innerText ||
        e.getAttribute('aria-label') ||
        (e as HTMLInputElement).value ||
        e.getAttribute('title') ||
        e.getAttribute('alt') ||
        e.getAttribute('placeholder'),
    );
  const hits: Array<{ el: Element; text: string }> = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (/^(script|style|template|noscript)$/i.test(el.tagName)) continue;
    const text = textOf(el);
    if (!matches(text) || !h.isVisible(el)) continue;
    hits.push({ el, text });
  }
  // Deepest: drop elements that contain another hit.
  const leaves = hits.filter((a) => !hits.some((b) => b.el !== a.el && a.el.contains(b.el)));
  leaves.sort((a, b) => a.text.length - b.text.length);
  const best = leaves[0];
  if (!best) return null;
  const el = best.el;
  return {
    selector: h.selector(el),
    role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
    name: best.text.slice(0, 120),
    tag: el.tagName.toLowerCase(),
  };
}

/** Success oracle (not the persona's perception): selector visible and/or text visible. */
export function checkSuccess(s: { selector?: string; text?: string }): boolean {
  const h = window.__clearA11y;
  if (s.selector) {
    const el = document.querySelector(s.selector);
    if (!el || (h && !h.isVisible(el))) return false;
  }
  if (s.text) {
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!norm(document.body?.innerText ?? '').includes(norm(s.text))) return false;
  }
  return true;
}
