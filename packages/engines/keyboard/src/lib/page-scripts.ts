/**
 * Functions that run inside the page via `page.evaluate`. Each one must be self-contained:
 * no imports and no references to module scope (they are serialized with `toString`).
 * They rely on `window.__clearA11y` from `ensureHelpers(page)`.
 */
import type { Rect } from '@clear-a11y/core';
import type { HitSample } from '../rules/focus-obscured.js';

/** Everything the engine records about the focused element at one stop. */
export interface ActiveInfo {
  selector: string;
  name: string;
  role: string;
  tag: string;
  /** Page coordinates (client rect + scroll). */
  rect: Rect;
  /** Viewport coordinates. */
  client: Rect;
  visible: boolean;
  /** Visually hidden or too small (< 4 px) to compare focus pixels on. */
  tiny: boolean;
  fixed: boolean;
  region: string;
  rtl: boolean;
  frame: boolean;
  inOverlay: boolean;
  /** elementFromPoint samples: `other` = covered by fixed/sticky author content. */
  hits: HitSample[];
}

/** Describes the deepest focused element, or null when focus is on body / outside the document. */
export function describeActive(overlaySelector: string | null): ActiveInfo | null {
  const h = window.__clearA11y;
  if (!h) throw new Error('helpers not installed');
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;

  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const nameOf = (e: Element): string => {
    const label = clean(e.getAttribute('aria-label'));
    if (label) return label;
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
    const labels = (e as HTMLInputElement).labels;
    if (labels && labels.length) {
      const t = clean(Array.from(labels, (l) => l.textContent).join(' '));
      if (t) return t;
    }
    const text = clean((e as HTMLElement).innerText ?? e.textContent);
    if (text) return text;
    return clean(
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
      if (['checkbox', 'radio', 'range'].includes(type)) return type === 'range' ? 'slider' : type;
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      return 'textbox';
    }
    if ((e as HTMLElement).isContentEditable) return 'textbox';
    return tag;
  };

  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const clipped =
    (style.clip !== 'auto' && style.clip !== '' && style.position === 'absolute') ||
    style.clipPath === 'inset(50%)';
  const visible = h.isVisible(el) && r.width > 0 && r.height > 0;
  const tiny = !visible || clipped || r.width < 4 || r.height < 4;

  let fixedEl: Element | null = null;
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'fixed' || p === 'sticky') {
      fixedEl = n;
      break;
    }
  }
  const landmark = el.closest(
    'dialog, [role=dialog], [role=alertdialog], header, nav, main, aside, footer, [role=banner], [role=navigation], [role=main], [role=complementary], [role=contentinfo], [role=search]',
  );
  const region = fixedEl
    ? `fixed:${h.selector(fixedEl)}`
    : landmark
      ? `${landmark.tagName.toLowerCase()}:${h.selector(landmark)}`
      : '';

  const overlay = overlaySelector ? document.querySelector(overlaySelector) : null;
  const inOverlay = !!overlay && (overlay === el || overlay.contains(el));

  // Is the element entirely covered by fixed/sticky author content (2.4.11)?
  const hits: HitSample[] = [];
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const x0 = Math.max(r.left, 0);
  const x1 = Math.min(r.right, vw);
  const y0 = Math.max(r.top, 0);
  const y1 = Math.min(r.bottom, vh);
  if (!tiny && x1 - x0 >= 2 && y1 - y0 >= 2) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const inFixed = (n: Element | null) => {
      for (let m = n; m && m !== document.documentElement; m = m.parentElement) {
        const p = getComputedStyle(m).position;
        if (p === 'fixed' || p === 'sticky') return true;
      }
      return false;
    };
    const labels = Array.from((el as HTMLInputElement).labels ?? []);
    for (const fy of [0.15, 0.5, 0.85]) {
      for (const fx of [0.15, 0.5, 0.85]) {
        const x = x0 + (x1 - x0) * fx;
        const y = y0 + (y1 - y0) * fy;
        const hit = root.elementFromPoint(x, y);
        const self =
          !hit ||
          hit === el ||
          el.contains(hit) ||
          hit.contains(el) ||
          labels.some((l) => l === hit || l.contains(hit));
        hits.push(!self && inFixed(hit) && !(fixedEl && fixedEl.contains(hit)) ? 'other' : 'self');
      }
    }
  }

  return {
    selector: h.selector(el),
    name: nameOf(el).slice(0, 120),
    role: roleOf(el),
    tag: el.tagName.toLowerCase(),
    rect: { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height },
    client: { x: r.x, y: r.y, width: r.width, height: r.height },
    visible,
    tiny,
    fixed: !!fixedEl,
    region,
    rtl: style.direction === 'rtl',
    frame: el.tagName === 'IFRAME' || el.tagName === 'FRAME',
    inOverlay,
    hits,
  };
}

/**
 * Moves the sequential focus navigation starting point to the top of the document: focus a
 * temporary element placed first in <body>, then remove it. Returns false when that is not
 * possible (for example, the rest of the page is inert behind a modal dialog).
 */
export function resetFocusToTop(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body) active.blur();
  const s = document.createElement('span');
  s.tabIndex = -1;
  s.setAttribute('data-clear-a11y-sentinel', '');
  s.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;';
  document.body.prepend(s);
  s.focus({ preventScroll: true });
  const ok = document.activeElement === s;
  s.remove();
  return ok;
}

/** Disables transitions/animations and hides the caret so focus screenshots are stable. */
export function installStableStyles(): void {
  if (document.getElementById('clear-a11y-keyboard-style')) return;
  const style = document.createElement('style');
  style.id = 'clear-a11y-keyboard-style';
  style.textContent =
    '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; caret-color: transparent !important; }';
  document.head.appendChild(style);
}

/** Blurs the focused element. Returns false when a blur handler immediately took focus back. */
export function blurActive(selector: string): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return true;
  el.blur();
  const now = document.activeElement;
  return !(now && now !== document.body && window.__clearA11y?.selector(now) === selector);
}

/** Re-focuses an element by selector (after a blur). Returns true when it has focus again. */
export function refocus(selector: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}

/** Focuses the element and lets the browser scroll it into view, as sequential navigation does. */
export function focusInView(selector: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;
  el.focus();
  return document.activeElement === el;
}

/** Number of elements Tab can reach (visible, enabled, tabIndex >= 0, not inert). */
export function countTabbable(): number {
  const h = window.__clearA11y;
  if (!h) throw new Error('helpers not installed');
  const all = document.querySelectorAll<HTMLElement>(
    'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]',
  );
  let n = 0;
  for (const el of Array.from(all)) {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) continue;
    if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
    if (el.closest('[inert]')) continue;
    if (!h.isVisible(el)) continue;
    n++;
  }
  return n;
}

/** True when `selector` is inside an open modal dialog that has a button-like control. */
export function inModalWithCloseControl(selector: string): boolean {
  const el = document.querySelector(selector);
  const dialog = el?.closest(
    'dialog[open], [role=dialog][aria-modal=true], [role=alertdialog][aria-modal=true]',
  );
  if (!dialog) return false;
  return !!dialog.querySelector(
    'button, [role=button], input[type=button], input[type=submit], a[href]',
  );
}

/** Page facts for skip-link checks. */
export interface PageStructure {
  hasMainLandmark: boolean;
  hasHeadings: boolean;
}

export function pageStructure(): PageStructure {
  return {
    hasMainLandmark: !!document.querySelector('main, [role=main]'),
    hasHeadings: !!document.querySelector('h1, h2, h3, h4, h5, h6, [role=heading]'),
  };
}

/** Facts about one in-page link (skip-link candidate). */
export interface LinkInfo {
  href: string | null;
  name: string;
  /** Selector of the nearest nav/header container, used as a finding target. */
  navContainer: string | null;
}

export function linkInfo(selector: string): LinkInfo | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const nav = el.closest('nav, header, [role=navigation], [role=banner]');
  return {
    href: el.tagName === 'A' ? el.getAttribute('href') : null,
    name: (
      el.getAttribute('aria-label') ||
      (el as HTMLElement).innerText ||
      el.textContent ||
      ''
    ).trim(),
    navContainer: nav ? (window.__clearA11y?.selector(nav) ?? null) : null,
  };
}

/**
 * How many of the first stops sit inside navigation or a banner, counted from the start until
 * the first stop outside, and the selector of the first such container.
 */
export function leadingNavStops(selectors: string[]): { count: number; container: string | null } {
  let count = 0;
  let container: string | null = null;
  for (const s of selectors) {
    const nav = document.querySelector(s)?.closest('nav, header, [role=navigation], [role=banner]');
    if (!nav) break;
    container ??= window.__clearA11y?.selector(nav) ?? null;
    count++;
  }
  return { count, container };
}

/** True when the element with id/name `id` exists. */
export function skipTargetExists(id: string): boolean {
  return !!(document.getElementById(id) || document.getElementsByName(id)[0]);
}

/** After activating a skip link and pressing Tab: did focus land inside or after the target? */
export function landedAfter(id: string): boolean | null {
  const target = document.getElementById(id) || document.getElementsByName(id)[0];
  const active = document.activeElement;
  if (!target || !active || active === document.body) return null;
  if (target === active || target.contains(active)) return true;
  return !!(target.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * True when a keyboard-focusable element exists inside or after the skip target in DOM order.
 * Without one, a Tab after the skip link has nowhere to go, so the check can't be verified.
 */
export function hasFocusableAfter(id: string): boolean {
  const target = document.getElementById(id) || document.getElementsByName(id)[0];
  if (!target) return false;
  const selector =
    'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable="true"], [contenteditable=""], [tabindex]';
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).some((el) => {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) return false;
    const inOrAfter =
      el === target ||
      target.contains(el) ||
      !!(target.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!inOrAfter) return false;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return (
      style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0
    );
  });
}

/** Resolves after two animation frames, so style changes from a key press are painted. */
export function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    // Background tabs may throttle rAF; never wait longer than 100 ms.
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
}
