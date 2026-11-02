import type { Page } from '@clear-a11y/browser';
import { describeActive, nextFrames } from './page-scripts.js';

/** The open overlay of the current state, found from the trigger or from open dialog/menu markup. */
export interface OverlayInfo {
  selector: string;
  /** document.activeElement is the overlay or inside it. */
  focusInside: boolean;
  /** Selector of the element focused when the engine started. */
  activeSelector: string | null;
}

/** Runs in the page. */
function locateOverlay(triggerSelector: string | null): OverlayInfo | null {
  const h = window.__clearA11y;
  if (!h) throw new Error('helpers not installed');
  const visible = (el: Element | null): el is Element => !!el && h.isVisible(el);
  let overlay: Element | null = null;
  const trigger = triggerSelector ? document.querySelector(triggerSelector) : null;
  for (const id of (trigger?.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean)) {
    const el = document.getElementById(id);
    if (visible(el)) {
      overlay = el;
      break;
    }
  }
  if (!overlay) {
    const candidates = Array.from(
      document.querySelectorAll(
        'dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true], [role=menu], [role=listbox], [popover]',
      ),
    ).filter((el) => visible(el) && !(el.matches('[popover]') && !el.matches(':popover-open')));
    // Prefer modal dialogs, then the last one in document order (usually the most recent).
    overlay =
      candidates.filter((el) => el.matches('dialog:modal, [aria-modal=true]')).pop() ??
      candidates.pop() ??
      null;
  }
  if (!overlay) return null;
  let active: Element | null = document.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  const onBody = !active || active === document.body || active === document.documentElement;
  return {
    selector: h.selector(overlay),
    focusInside: !onBody && (overlay === active || overlay.contains(active)),
    activeSelector: onBody ? null : h.selector(active as Element),
  };
}

export function findOverlay(page: Page, triggerSelector: string | undefined) {
  return page.evaluate(locateOverlay, triggerSelector ?? null);
}

/** Runs in the page: is the element still on the page and visible? */
function isOpen(selector: string): boolean {
  const el = document.querySelector(selector);
  return !!el && !!window.__clearA11y?.isVisible(el);
}

/** Runs in the page: focus the first focusable element inside the overlay (or the overlay). */
function focusInto(selector: string): boolean {
  const overlay = document.querySelector(selector) as HTMLElement | null;
  if (!overlay) return false;
  const first = Array.from(
    overlay.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    ),
  ).find((el) => !(el as HTMLButtonElement).disabled && window.__clearA11y?.isVisible(el));
  (first ?? overlay).focus();
  return overlay.contains(document.activeElement);
}

/** Runs in the page: selector of a control inside the overlay that looks like it closes it. */
function findCloseControl(selector: string): string | null {
  const overlay = document.querySelector(selector);
  if (!overlay) return null;
  const controls = Array.from(
    overlay.querySelectorAll<HTMLElement>(
      'button, [role=button], input[type=button], input[type=submit], a[href]',
    ),
  ).filter((el) => window.__clearA11y?.isVisible(el));
  const label = (el: HTMLElement) =>
    `${el.getAttribute('aria-label') ?? ''} ${el.innerText ?? ''} ${el.getAttribute('title') ?? ''} ${(el as HTMLInputElement).value ?? ''}`.trim();
  const close = controls.find((el) => /\b(close|dismiss|cancel|done)\b|^[×✕✖x]$/i.test(label(el)));
  return close ? (window.__clearA11y?.selector(close) ?? null) : null;
}

/** Runs in the page: is focus on the trigger (or inside it), and is the trigger still usable? */
function focusOnTrigger(triggerSelector: string): {
  triggerAvailable: boolean;
  focusOnTrigger: boolean;
} {
  const trigger = document.querySelector(triggerSelector);
  const active = document.activeElement;
  return {
    triggerAvailable: !!trigger && !!window.__clearA11y?.isVisible(trigger),
    focusOnTrigger: !!trigger && !!active && (trigger === active || trigger.contains(active)),
  };
}

export interface OverlayCloseResult {
  /** Escape closed the overlay. */
  escapeClosed: boolean;
  /** How it was finally closed, or null when neither Escape nor a close control worked. */
  closedBy: 'escape' | 'close-control' | null;
  closeControl: string | null;
  /** Focused element after closing (null = body / outside the document). */
  activeAfterClose: string | null;
  triggerAvailable: boolean;
  focusOnTrigger: boolean;
}

/**
 * Closes the overlay like a keyboard user: Escape first (with focus inside the overlay), then
 * Enter on its close control. Reports where focus went afterwards.
 */
export async function closeOverlay(
  page: Page,
  overlaySelector: string,
  triggerSelector: string | undefined,
): Promise<OverlayCloseResult> {
  await page.evaluate(focusInto, overlaySelector);
  await page.keyboard.press('Escape');
  await page.evaluate(nextFrames);
  const escapeClosed = !(await page.evaluate(isOpen, overlaySelector));
  let closedBy: OverlayCloseResult['closedBy'] = escapeClosed ? 'escape' : null;
  let closeControl: string | null = null;
  if (!escapeClosed) {
    closeControl = await page.evaluate(findCloseControl, overlaySelector);
    if (closeControl) {
      await page.focus(closeControl).catch(() => undefined);
      await page.keyboard.press('Enter');
      await page.evaluate(nextFrames);
      if (!(await page.evaluate(isOpen, overlaySelector))) closedBy = 'close-control';
    }
  }
  const active = closedBy ? await page.evaluate(describeActive, null) : null;
  const trigger = triggerSelector
    ? await page.evaluate(focusOnTrigger, triggerSelector)
    : { triggerAvailable: false, focusOnTrigger: false };
  return {
    escapeClosed,
    closedBy,
    closeControl,
    activeAfterClose: active?.selector ?? null,
    ...trigger,
  };
}
