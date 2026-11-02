import type { PageHelpers } from '@clear-a11y/browser';
import {
  detectOrientationLock,
  orientationLockedRule,
  ROTATE_MESSAGE,
  type OrientationMeasure,
} from '../rules/orientation-locked.js';
import type { VisualRun } from './context.js';
import { settle } from './layout.js';

/** Phone and tablet sizes, each compared in portrait and landscape. */
export const ORIENTATION_PAIRS = [
  { name: 'phone', short: 375, long: 812 },
  { name: 'tablet', short: 768, long: 1024 },
] as const;

/**
 * Measures what the page shows at the current viewport: visible text, rotate messages (and how
 * much of the viewport they cover) and whether html, body or a large container is turned by about
 * 90 degrees. Self-contained: runs in the page.
 */
export function measureOrientation(args: {
  viewport: string;
  pattern: string;
}): OrientationMeasure {
  const h = window.__clearA11y as PageHelpers;
  const rotate = new RegExp(args.pattern, 'i');
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const shown = (el: Element): boolean => {
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Visible text, counted per text node whose parent is rendered.
  let textLength = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const parentShown = new Map<Element, boolean>();
  for (let n = walker.nextNode(); n && textLength < 50_000; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || skip.has(parent.tagName)) continue;
    const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let ok = parentShown.get(parent);
    if (ok === undefined) {
      ok = shown(parent);
      parentShown.set(parent, ok);
    }
    if (ok) textLength += text.length;
  }

  // Rotate messages: the smallest visible element whose text matches.
  const messages: OrientationMeasure['messages'] = [];
  const candidates = Array.from(
    document.body.querySelectorAll('p, div, section, aside, h1, h2, h3, h4, span, strong, dialog'),
  );
  for (const el of candidates) {
    if (messages.length >= 5) break;
    const text = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 300 || !rotate.test(text) || !shown(el)) continue;
    // Prefer the innermost match: skip an element when a matching child carries the same text.
    const inner = Array.from(el.children).some((c) => {
      const t = ((c as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
      return t.length > 0 && rotate.test(t);
    });
    if (inner) continue;
    // The message box: the nearest positioned ancestor drawn over the page, else the element.
    let box: Element = el;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'absolute') {
        box = p;
        break;
      }
    }
    let hits = 0;
    let total = 0;
    for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        total++;
        const hit = document.elementFromPoint(vw * fx, vh * fy);
        if (hit && (hit === box || box.contains(hit))) hits++;
      }
    }
    messages.push({ selector: h.selector(el), text: text.slice(0, 200), coverage: hits / total });
  }

  // A turned page: html, body or a large container rotated by roughly 90 or 270 degrees.
  const angleOf = (el: Element): number => {
    const style = getComputedStyle(el);
    let angle = 0;
    const m = style.transform.match(/^matrix\(([^)]+)\)$/);
    if (m) {
      const [a, b] = (m[1] ?? '').split(',').map((x) => Number.parseFloat(x));
      if (a !== undefined && b !== undefined) angle = (Math.atan2(b, a) * 180) / Math.PI;
    }
    const r = style.rotate.match(/^(-?[\d.]+)deg$/);
    if (r) angle += Number.parseFloat(r[1] ?? '0');
    return ((angle % 360) + 360) % 360;
  };
  const quarter = (a: number) => Math.abs(a - 90) <= 10 || Math.abs(a - 270) <= 10;
  let rotated: OrientationMeasure['rotated'] = null;
  const large = [document.documentElement, document.body, ...Array.from(document.body.children)];
  for (const el of large) {
    if (!(el instanceof Element) || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (
      el !== document.documentElement &&
      el !== document.body &&
      r.width * r.height < vw * vh * 0.5
    )
      continue;
    const angle = angleOf(el);
    if (quarter(angle)) {
      rotated = { selector: h.selector(el), angle: Math.round(angle) };
      break;
    }
  }

  return {
    orientation: vh > vw ? 'portrait' : 'landscape',
    viewport: args.viewport,
    textLength,
    rotated,
    messages,
  };
}

/**
 * SC 1.3.4: lays the page out in portrait and in landscape at phone and tablet sizes and compares
 * what is shown. Stops at the first lock found; restores the viewport and scroll position.
 */
export async function checkOrientation(run: VisualRun): Promise<void> {
  const { page, viewport } = run.ctx;
  try {
    for (const pair of ORIENTATION_PAIRS) {
      const measure = async (width: number, height: number, label: string) => {
        await page.setViewportSize({ width, height });
        await settle(page);
        return page.evaluate(measureOrientation, {
          viewport: label,
          pattern: ROTATE_MESSAGE.source,
        });
      };
      const portrait = await measure(pair.short, pair.long, `${pair.short}x${pair.long}`);
      const landscape = await measure(pair.long, pair.short, `${pair.long}x${pair.short}`);
      const lock = detectOrientationLock(portrait, landscape);
      if (!lock) continue;
      const restricted = lock.lockedTo === 'portrait' ? 'landscape' : 'portrait';
      const sizes = `${pair.name}: ${portrait.viewport} portrait, ${landscape.viewport} landscape`;
      const message =
        lock.kind === 'hidden-behind-message'
          ? `In ${restricted} orientation (${sizes}) the page hides its content behind the message "${lock.message}". People whose device is fixed in ${restricted}, for example mounted on a wheelchair, cannot use the page.`
          : lock.kind === 'rotated'
            ? `In ${restricted} orientation (${sizes}) the page turns itself by 90 degrees to keep a ${lock.lockedTo} layout. People whose device is fixed in ${restricted} have to read sideways.`
            : `In ${restricted} orientation (${sizes}) almost all of the page's content disappears (${lock.textLength.restricted} characters of text instead of ${lock.textLength.working}). People whose device is fixed in ${restricted} cannot use the page.`;
      await run.emit(orientationLockedRule, {
        selector: lock.selector,
        tier: lock.tier,
        message,
        evidence: {
          data: {
            kind: lock.kind,
            lockedTo: lock.lockedTo,
            portrait: portrait.viewport,
            landscape: landscape.viewport,
            textLength: lock.textLength,
            ...(lock.message ? { rotateMessage: lock.message } : {}),
          },
        },
      });
      return;
    }
  } finally {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}
