import type { Page } from '@clear-a11y/browser';
import type { Widget } from './types.js';

/** What the page tells us about one candidate element (collected in the page, classified here). */
export interface RawElement {
  selector: string;
  tag: string;
  /** First token of the explicit `role` attribute. */
  role: string | null;
  hasPopup: string | null;
  expanded: string | null;
  /** Selector of the first `aria-controls` target that exists. */
  controls: string | null;
  /** Role of that target (`dialog` for a `<dialog>` element). */
  controlsRole: string | null;
  visible: boolean;
  /** Role of the closest composite-widget ancestor (tablist, menu, listbox, grid...). */
  composite: string | null;
  /** A submit button: we never press these while probing. */
  submits: boolean;
  /** For listboxes: popup of a combobox (tested with the combobox). */
  controlledByCombobox: boolean;
}

export interface Detection {
  widgets: Widget[];
  /** Dialogs that are hidden at load and have no linked trigger. */
  orphanDialogs: string[];
  /** Visible plain buttons that may open one of those dialogs. */
  probeButtons: string[];
}

const DIALOG_ROLES = new Set(['dialog', 'alertdialog']);
const MENU_POPUPS = new Set(['true', 'menu']);
/** Roles whose own contract covers aria-expanded (not a disclosure). */
const NOT_DISCLOSURE_ROLES = new Set([
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'combobox',
  'treeitem',
  'option',
  'gridcell',
  'row',
]);

const isButtonish = (e: RawElement) =>
  (e.role === 'button' || (e.role === null && (e.tag === 'button' || e.tag === 'a'))) &&
  e.tag !== 'summary';

/** Pure classification of candidates into widgets the contracts know how to drive. */
export function classifyWidgets(raw: readonly RawElement[]): Detection {
  const widgets: Widget[] = [];
  const linkedDialogs = new Set<string>();
  for (const e of raw) {
    if (!e.visible) continue;
    if (e.role === 'tablist') widgets.push({ kind: 'tabs', selector: e.selector });
    else if (e.role === 'menubar') widgets.push({ kind: 'menubar', selector: e.selector });
    else if (e.role === 'combobox')
      widgets.push({
        kind: 'combobox',
        selector: e.selector,
        ...(e.controls ? { related: e.controls } : {}),
      });
    else if (e.role === 'listbox' && !e.controlledByCombobox && e.composite !== 'combobox')
      widgets.push({ kind: 'listbox', selector: e.selector });
    else if (e.role === 'grid') widgets.push({ kind: 'grid', selector: e.selector });
    else if (isButtonish(e)) {
      if (
        e.hasPopup !== null &&
        MENU_POPUPS.has(e.hasPopup) &&
        (e.controlsRole ?? 'menu') === 'menu'
      )
        widgets.push({
          kind: 'menu-button',
          selector: e.selector,
          ...(e.controls ? { related: e.controls } : {}),
        });
      else if (
        e.controls &&
        (e.hasPopup === 'dialog' || (e.controlsRole !== null && DIALOG_ROLES.has(e.controlsRole)))
      ) {
        linkedDialogs.add(e.controls);
        widgets.push({ kind: 'dialog', selector: e.controls, trigger: e.selector });
      } else if (
        e.expanded !== null &&
        (e.hasPopup === null || e.hasPopup === 'false') &&
        e.composite === null
      )
        widgets.push({
          kind: 'disclosure',
          selector: e.selector,
          ...(e.controls ? { related: e.controls } : {}),
        });
    }
  }
  const orphanDialogs = raw
    .filter(
      (e) =>
        !e.visible &&
        (DIALOG_ROLES.has(e.role ?? '') || (e.tag === 'dialog' && e.role === null)) &&
        !linkedDialogs.has(e.selector),
    )
    .map((e) => e.selector);
  const probeButtons = orphanDialogs.length
    ? raw
        .filter(
          (e) =>
            e.visible &&
            isButtonish(e) &&
            e.tag !== 'a' &&
            !e.submits &&
            e.composite === null &&
            e.expanded === null &&
            e.hasPopup === null &&
            !NOT_DISCLOSURE_ROLES.has(e.role ?? ''),
        )
        .map((e) => e.selector)
    : [];
  return { widgets, orphanDialogs, probeButtons };
}

/** Runs in the page (needs `window.__clearA11y`). Self-contained: no closures over module scope. */
function collectRaw(): RawElement[] {
  const h = window.__clearA11y!;
  const COMPOSITES = 'tablist, menu, menubar, listbox, grid, treegrid, tree, combobox, radiogroup';
  const roleOf = (el: Element | null): string | null =>
    el?.getAttribute('role')?.trim().split(/\s+/)[0]?.toLowerCase() || null;
  const byId = (ids: string | null): Element | null => {
    for (const id of (ids ?? '').split(/\s+/).filter(Boolean)) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  };
  const comboPopups = new Set<Element>();
  for (const cb of Array.from(document.querySelectorAll('[role~="combobox"]'))) {
    for (const attr of ['aria-controls', 'aria-owns']) {
      const target = byId(cb.getAttribute(attr));
      if (target) comboPopups.add(target);
    }
  }
  const candidates = document.querySelectorAll(
    '[role], button, dialog, a[aria-expanded], a[aria-haspopup]',
  );
  const out: RawElement[] = [];
  for (const el of Array.from(candidates)) {
    const role = roleOf(el);
    const tag = el.tagName.toLowerCase();
    const relevant =
      tag === 'button' ||
      tag === 'dialog' ||
      tag === 'a' ||
      [
        'tablist',
        'menubar',
        'combobox',
        'listbox',
        'grid',
        'dialog',
        'alertdialog',
        'button',
      ].includes(role ?? '');
    if (!relevant) continue;
    const target = byId(el.getAttribute('aria-controls'));
    const compositeAncestor = el.parentElement?.closest(
      COMPOSITES.split(', ')
        .map((r) => `[role~="${r}"]`)
        .join(', '),
    );
    const form = el.closest('form');
    const typeAttr = el.getAttribute('type')?.toLowerCase();
    out.push({
      selector: h.selector(el),
      tag,
      role,
      hasPopup: el.getAttribute('aria-haspopup'),
      expanded: el.getAttribute('aria-expanded'),
      controls: target ? h.selector(target) : null,
      controlsRole: target
        ? (roleOf(target) ?? (target.tagName.toLowerCase() === 'dialog' ? 'dialog' : null))
        : null,
      visible:
        tag === 'dialog' ? (el as HTMLDialogElement).open && h.isVisible(el) : h.isVisible(el),
      composite: roleOf(compositeAncestor ?? null),
      submits: tag === 'button' && !!form && (typeAttr === undefined || typeAttr === 'submit'),
      controlledByCombobox: comboPopups.has(el),
    });
  }
  return out;
}

/** Finds the widgets on the current page. */
export async function detectWidgets(page: Page): Promise<Detection> {
  return classifyWidgets(await page.evaluate(collectRaw));
}
