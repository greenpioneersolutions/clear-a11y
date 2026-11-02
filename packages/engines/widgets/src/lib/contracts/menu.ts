import {
  evaluateMenuButton,
  evaluateMenubar,
  MENU_KEYS,
  type MenuButtonObservation,
  type MenuKey,
  type MenuOpenResult,
} from '../../rules/menu-keyboard.js';
import type { Driver } from '../driver.js';
import type { RovingItem } from '../roving.js';
import type { Problem, Step, Widget } from '../types.js';

interface MenuRead extends MenuOpenResult {
  items: RovingItem[];
  focusOnButton: boolean;
  tabbable: boolean;
}

/** Runs in the page: the menu button, its popup and the popup's items. */
function readMenu(arg: { button: string; popup: string | null }): MenuRead {
  const h = window.__clearA11y!;
  const button = document.querySelector(arg.button) as HTMLElement | null;
  const empty = {
    open: false,
    expanded: null,
    focusInMenu: false,
    items: [],
    focusOnButton: false,
    tabbable: false,
  };
  if (!button) return empty;
  const sibling = button.nextElementSibling;
  const popup =
    (arg.popup ? document.querySelector(arg.popup) : null) ??
    (sibling?.matches('[role~="menu"]') ? sibling : null) ??
    button.parentElement?.querySelector('[role~="menu"]') ??
    null;
  const shown = (el: Element) => h.isVisible(el) && !el.closest('[hidden]');
  const open = !!popup && shown(popup);
  const active = document.activeElement;
  const items = open
    ? Array.from(popup!.querySelectorAll('[role^="menuitem"]')).filter(
        (i) =>
          i.closest('[role~="menu"], [role~="menubar"]') === popup &&
          shown(i) &&
          i.getAttribute('aria-disabled') !== 'true',
      )
    : [];
  return {
    open,
    expanded: button.getAttribute('aria-expanded'),
    focusInMenu: !!popup && !!active && popup.contains(active),
    items: items.map((i) => ({
      selector: h.selector(i),
      tabbable: (i as HTMLElement).tabIndex >= 0,
    })),
    focusOnButton: active === button,
    tabbable: button.tabIndex >= 0 && shown(button),
  };
}

const opened = (r: MenuRead): MenuOpenResult => ({
  open: r.open,
  expanded: r.expanded,
  focusInMenu: r.focusInMenu,
});

/** APG menu button: open keys, item navigation, Escape. */
export async function runMenuButton(drv: Driver, widget: Widget): Promise<Problem[]> {
  const arg = { button: widget.selector, popup: widget.related ?? null };
  await drv.fresh();
  const initial = await drv.evaluate(readMenu, arg);
  // A menu that is already open at load (or missing) is not a menu button we can test.
  if (initial.open) return [];

  const open = {} as Record<MenuKey | 'click', MenuOpenResult>;
  let items: RovingItem[] = [];
  for (const key of MENU_KEYS) {
    await drv.fresh();
    await drv.focus(widget.selector);
    await drv.press(key);
    const r = await drv.evaluate(readMenu, arg);
    open[key] = opened(r);
    if (r.open && !items.length) items = r.items;
  }
  await drv.fresh();
  await drv.click(widget.selector);
  const clicked = await drv.evaluate(readMenu, arg);
  open.click = opened(clicked);
  if (!items.length) items = clicked.items;

  const obs: MenuButtonObservation = {
    button: widget.selector,
    buttonTabbable: initial.tabbable,
    open,
    items,
    steps: [],
    escape: null,
  };
  const openKey = MENU_KEYS.find((k) => open[k].open);
  if (openKey) {
    await drv.fresh();
    await drv.focus(widget.selector);
    await drv.press(openKey);
    const steps: Step[] = [{ key: 'start', focused: await drv.focused(true) }];
    for (let i = 0; i <= items.length; i++) {
      steps.push({ key: 'ArrowDown', focused: await drv.press('ArrowDown') });
    }
    obs.steps = steps;
    await drv.press('Escape');
    const after = await drv.evaluate(readMenu, arg);
    obs.escape = { closed: !after.open, focusOnButton: after.focusOnButton };
  }
  return evaluateMenuButton(obs);
}

/** Runs in the page: top-level items of a menubar. */
function readMenubar(selector: string): { vertical: boolean; items: RovingItem[] } {
  const h = window.__clearA11y!;
  const bar = document.querySelector(selector);
  if (!bar) return { vertical: false, items: [] };
  const items = Array.from(bar.querySelectorAll('[role^="menuitem"]')).filter(
    (i) =>
      i.closest('[role~="menu"], [role~="menubar"]') === bar &&
      h.isVisible(i) &&
      i.getAttribute('aria-disabled') !== 'true',
  );
  return {
    vertical: bar.getAttribute('aria-orientation') === 'vertical',
    items: items.map((i) => ({
      selector: h.selector(i),
      tabbable: (i as HTMLElement).tabIndex >= 0,
    })),
  };
}

/** APG menubar: every top-level item is reachable with Tab or the arrow keys. */
export async function runMenubar(drv: Driver, widget: Widget): Promise<Problem[]> {
  await drv.fresh();
  const info = await drv.evaluate(readMenubar, widget.selector);
  if (info.items.length < 2) return [];
  const steps: Step[] = [];
  const start = info.items.find((i) => i.tabbable);
  if (start) {
    await drv.focus(start.selector);
    steps.push({ key: 'start', focused: await drv.focused(true) });
    const [next, prev] = info.vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
    for (const key of [
      ...Array<string>(info.items.length).fill(next!),
      ...Array<string>(info.items.length).fill(prev!),
    ]) {
      steps.push({ key, focused: await drv.press(key) });
    }
  }
  return evaluateMenubar({ menubar: widget.selector, items: info.items, steps });
}
