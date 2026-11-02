import type { ElementHandle, Page } from 'playwright';
import type { PageHelpers } from './types.js';

/**
 * Runs inside the page. Must be self-contained: no imports, no closures over module scope.
 * Installs `window.__clearA11y`.
 */
export function installHelpers(): void {
  if (window.__clearA11y) return;
  const esc = (s: string) =>
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1');

  const selector = (el: Element): string => {
    if (el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.documentElement) {
      if (node.id && document.querySelectorAll(`#${esc(node.id)}`).length === 1) {
        parts.unshift(`#${esc(node.id)}`);
        break;
      }
      const tag = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const same = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      node = parent === document.body ? null : parent;
      if (parent === document.body) parts.unshift('body');
    }
    return parts.join(' > ');
  };

  const isVisible = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const FOCUSABLE =
    'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]';
  const isFocusable = (el: Element): boolean => {
    if (!(el instanceof HTMLElement) || !el.matches(FOCUSABLE)) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) return false;
    return isVisible(el);
  };

  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  };

  const snippet = (el: Element, max = 200): string => {
    const html = el.outerHTML.replace(/\s+/g, ' ');
    return html.length > max ? `${html.slice(0, max - 1)}…` : html;
  };

  const helpers: PageHelpers = { selector, isVisible, isFocusable, rect, snippet };
  Object.defineProperty(window, '__clearA11y', { value: helpers, configurable: true });
}

/** Installs the in-page helpers into the current document (idempotent). */
export async function ensureHelpers(page: Page): Promise<void> {
  await page.evaluate(installHelpers);
}

/**
 * The one shared stable-selector helper: `#id` when unique, otherwise a short CSS path.
 * Every engine uses it so dedupe and benchmark matching line up across engines.
 */
export async function selectorFor(handle: ElementHandle<Element>): Promise<string> {
  const frame = await handle.ownerFrame();
  if (frame) await frame.evaluate(installHelpers);
  return handle.evaluate((el) => window.__clearA11y!.selector(el));
}
