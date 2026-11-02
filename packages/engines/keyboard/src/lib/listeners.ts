import { getCdpSession, type Page } from '@clear-a11y/browser';
import type { ClickCandidate } from '../rules/click-not-focusable.js';

/** Event types that make an element act like a mouse control. */
export const CLICK_EVENTS = ['click', 'mousedown', 'pointerdown', 'mouseup', 'pointerup'];

export interface ClickCandidateInfo extends ClickCandidate {
  selector: string;
  name: string;
  html: string;
}

declare global {
  interface Window {
    __clearA11yClickTargets?: Set<Element>;
  }
}

/**
 * Marks every element that has a click-like listener attached directly to it, using the
 * DevTools protocol (`DOMDebugger.getEventListeners` over the whole tree). Listeners on
 * `window`, `document` and `<body>` are delegation and are ignored.
 */
async function markListenerTargets(page: Page, max: number): Promise<void> {
  const cdp = await getCdpSession(page);
  try {
    await cdp.send('DOM.getDocument', { depth: 0 });
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document' });
    if (!result.objectId) return;
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
      objectId: result.objectId,
      depth: -1,
      pierce: true,
    });
    const nodes = [
      ...new Set(
        listeners
          .filter((l) => CLICK_EVENTS.includes(l.type) && l.backendNodeId !== undefined)
          .map((l) => l.backendNodeId as number),
      ),
    ].slice(0, max);
    for (const backendNodeId of nodes) {
      const { object } = await cdp
        .send('DOM.resolveNode', { backendNodeId })
        .catch(() => ({ object: undefined }));
      if (!object?.objectId) continue;
      await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration:
          'function () { if (this instanceof Element) { (window.__clearA11yClickTargets ||= new Set()).add(this); } }',
      });
    }
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

/** Runs in the page: turns marked listeners, onclick and pointer cursors into candidates. */
function analyzeClickCandidates(max: number): ClickCandidateInfo[] {
  const h = window.__clearA11y;
  if (!h) throw new Error('helpers not installed');
  const listened = window.__clearA11yClickTargets ?? new Set<Element>();
  const FOCUSABLE =
    'a[href], area[href], button, input:not([type=hidden]), select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]';
  const focusable = (el: Element) =>
    el.matches(FOCUSABLE) && !(el as HTMLButtonElement).disabled && h.isVisible(el);
  const pointer = (el: Element) => getComputedStyle(el).cursor === 'pointer';

  const pool = new Set<Element>(listened);
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (pool.size >= max * 4) break;
    if (el.hasAttribute('onclick') || typeof (el as HTMLElement).onclick === 'function') {
      pool.add(el);
    } else if (pointer(el) && !(el.parentElement && pointer(el.parentElement))) {
      pool.add(el); // topmost element of a pointer-cursor region
    }
  }

  const out: ClickCandidateInfo[] = [];
  for (const el of pool) {
    if (out.length >= max) break;
    if (el === document.body || el === document.documentElement || !el.isConnected) continue;
    const label = el.closest('label') as HTMLLabelElement | null;
    const focusableNearby =
      el.matches(FOCUSABLE) ||
      !!el.closest(FOCUSABLE) ||
      Array.from(el.querySelectorAll(FOCUSABLE)).some(focusable) ||
      !!(label && label.control);
    const r = el.getBoundingClientRect();
    out.push({
      selector: h.selector(el),
      name: ((el as HTMLElement).innerText ?? el.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80),
      html: h.snippet(el),
      hasListener: listened.has(el),
      hasOnclick: el.hasAttribute('onclick') || typeof (el as HTMLElement).onclick === 'function',
      pointerCursor: pointer(el),
      focusableNearby,
      visible: h.isVisible(el) && r.width > 0 && r.height > 0,
    });
  }
  return out;
}

/** Collects elements that act like mouse controls, with the facts the rule needs. */
export async function collectClickCandidates(
  page: Page,
  max: number,
): Promise<ClickCandidateInfo[]> {
  await markListenerTargets(page, max).catch(() => undefined);
  return page.evaluate(analyzeClickCandidates, max);
}
