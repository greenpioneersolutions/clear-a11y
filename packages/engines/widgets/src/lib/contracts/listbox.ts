import { evaluateListbox, type ListboxNavStep } from '../../rules/listbox-keyboard.js';
import type { Driver } from '../driver.js';
import type { Problem, Widget } from '../types.js';

interface ListboxRead {
  options: number;
  tabbable: boolean;
  allOptionsTabbable: boolean;
  /** What a Tab press would land on: the listbox or its tabbable (preferably selected) option. */
  target: string | null;
  step: Omit<ListboxNavStep, 'key'>;
}

/** Runs in the page. */
function readListbox(selector: string): ListboxRead | null {
  const h = window.__clearA11y!;
  const lb = document.querySelector(selector) as HTMLElement | null;
  if (!lb) return null;
  const shown = (el: Element) => h.isVisible(el) && !el.closest('[hidden]');
  const options = Array.from(lb.querySelectorAll('[role~="option"]')).filter(
    (o) =>
      o.closest('[role~="listbox"]') === lb &&
      shown(o) &&
      o.getAttribute('aria-disabled') !== 'true',
  ) as HTMLElement[];
  const tabbableOptions = options.filter((o) => o.tabIndex >= 0);
  const lbTabbable = lb.tabIndex >= 0 && shown(lb);
  const target = lbTabbable
    ? lb
    : (tabbableOptions.find((o) => o.getAttribute('aria-selected') === 'true') ??
      tabbableOptions[0] ??
      null);
  const id = lb.getAttribute('aria-activedescendant');
  const active = id ? document.getElementById(id) : null;
  const focused = document.activeElement;
  return {
    options: options.length,
    tabbable: !!target,
    allOptionsTabbable: options.length > 0 && tabbableOptions.length === options.length,
    target: target ? h.selector(target) : null,
    step: {
      activeOption: active && options.includes(active) ? h.selector(active) : null,
      focusedOption:
        focused && options.includes(focused as HTMLElement) ? h.selector(focused) : null,
      selected: options
        .filter((o) => o.getAttribute('aria-selected') === 'true')
        .map((o) => h.selector(o)),
      look: options
        .map((o) => `${o.getAttribute('class') ?? ''}|${o.getAttribute('style') ?? ''}`)
        .join(';'),
    },
  };
}

/** APG listbox: focus it, press Down Arrow, check the active option is exposed. */
export async function runListbox(drv: Driver, widget: Widget): Promise<Problem[]> {
  await drv.fresh();
  const initial = await drv.evaluate(readListbox, widget.selector);
  if (!initial) return [];
  const nav: ListboxNavStep[] = [];
  if (initial.target) {
    await drv.focus(initial.target);
    const start = await drv.evaluate(readListbox, widget.selector);
    nav.push({ key: 'start', ...start!.step });
    for (let i = 0; i < 2; i++) {
      await drv.press('ArrowDown');
      const r = await drv.evaluate(readListbox, widget.selector);
      if (r) nav.push({ key: 'ArrowDown', ...r.step });
    }
  }
  return evaluateListbox({
    listbox: widget.selector,
    options: initial.options,
    tabbable: initial.tabbable,
    allOptionsTabbable: initial.allOptionsTabbable,
    nav,
  });
}
