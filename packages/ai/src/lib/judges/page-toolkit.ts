import { ensureHelpers, type Page } from '@clear-a11y/browser';

/** Read-only DOM helpers the judges use inside the page (`window.__clearA11yAi`). */
export interface AiPageToolkit {
  /** Collapses whitespace and truncates. */
  clean(s: string | null | undefined, max?: number): string;
  /** Approximate accessible name: aria-labelledby, aria-label, alt, labels, then text. */
  name(el: Element): string;
  /** Rendered text, including alt text of images inside. */
  text(el: Element): string;
  /** Text of the enclosing paragraph, list item, table cell or caption. */
  block(el: Element): string;
  /** Nearest heading before the element in document order. */
  headingBefore(el: Element): string;
  /** Text of the elements referenced by aria-describedby. */
  describedBy(el: Element): string;
  /** Hidden from everyone (display/visibility) or from assistive technology (aria-hidden, inert). */
  hidden(el: Element): boolean;
}

declare global {
  interface Window {
    __clearA11yAi?: AiPageToolkit;
  }
}

/** Runs inside the page. Self-contained: no imports, no closures over module scope. */
export function installAiToolkit(): void {
  if (window.__clearA11yAi) return;
  const clean = (s: string | null | undefined, max = 300): string => {
    const t = (s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  const byIds = (ids: string | null): string =>
    (ids ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
  const text = (el: Element): string => {
    const own = (el as HTMLElement).innerText ?? el.textContent ?? '';
    const alts = Array.from(el.querySelectorAll('img[alt], [role=img][aria-label]'))
      .map((i) => i.getAttribute('alt') ?? i.getAttribute('aria-label') ?? '')
      .join(' ');
    return clean(`${own} ${alts}`);
  };
  const name = (el: Element): string => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby && clean(byIds(labelledby))) return clean(byIds(labelledby));
    const label = el.getAttribute('aria-label');
    if (label && clean(label)) return clean(label);
    if (el.matches('img, area, input[type=image]')) return clean(el.getAttribute('alt'));
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length) {
      return clean(
        Array.from(labels)
          .map((l) => l.innerText)
          .join(' '),
      );
    }
    if (el.matches('input[type=submit], input[type=button], input[type=reset]')) {
      return clean((el as HTMLInputElement).value);
    }
    return text(el) || clean(el.getAttribute('title'));
  };
  const block = (el: Element): string => {
    const b = el.closest(
      'p, li, td, th, dd, dt, figcaption, blockquote, caption, [role=listitem], [role=cell], [role=gridcell]',
    );
    return b ? clean((b as HTMLElement).innerText) : '';
  };
  const headingBefore = (el: Element): string => {
    const headings = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]'),
    );
    let found = '';
    for (const h of headings) {
      if (h === el || h.contains(el)) continue;
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        found = clean((h as HTMLElement).innerText, 120);
      }
    }
    return found;
  };
  const describedBy = (el: Element): string => clean(byIds(el.getAttribute('aria-describedby')));
  const hidden = (el: Element): boolean => {
    if (el.closest('[aria-hidden=true], [inert]')) return true;
    const style = getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  };
  const toolkit: AiPageToolkit = { clean, name, text, block, headingBefore, describedBy, hidden };
  Object.defineProperty(window, '__clearA11yAi', { value: toolkit, configurable: true });
}

/** Installs the shared helpers and the judge toolkit (idempotent). */
export async function ensureToolkit(page: Page): Promise<void> {
  await ensureHelpers(page);
  await page.evaluate(installAiToolkit);
}
