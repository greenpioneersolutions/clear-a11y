import {
  evaluateCombobox,
  type ComboboxObservation,
  type ComboNavStep,
  type ComboOpenMethod,
} from '../../rules/combobox-keyboard.js';
import type { Driver } from '../driver.js';
import type { Problem, Widget } from '../types.js';

interface ComboRead {
  /** Element that takes focus and keys: the combobox, or the input inside an ARIA 1.1 wrapper. */
  input: string;
  editable: boolean;
  tabbable: boolean;
  popupVisible: boolean;
  expanded: string | null;
  options: number;
  firstOptionText: string;
  activeOption: string | null;
  focusedOption: string | null;
  look: string;
  value: string;
}

/** Runs in the page. */
function readCombobox(arg: { combobox: string; popup: string | null }): ComboRead | null {
  const h = window.__clearA11y!;
  const combo = document.querySelector(arg.combobox) as HTMLElement | null;
  if (!combo) return null;
  const isField = (el: Element) =>
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el as HTMLElement).isContentEditable;
  const input = (
    isField(combo) ? combo : (combo.querySelector('input, textarea') ?? combo)
  ) as HTMLElement;
  const idRef = (el: Element, attr: string) => {
    const id = (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)[0];
    return id ? document.getElementById(id) : null;
  };
  const popup =
    (arg.popup ? document.querySelector(arg.popup) : null) ??
    idRef(combo, 'aria-controls') ??
    idRef(combo, 'aria-owns') ??
    idRef(input, 'aria-controls') ??
    combo.querySelector('[role~="listbox"], [role~="grid"], [role~="tree"]');
  const shown = (el: Element) => h.isVisible(el) && !el.closest('[hidden]');
  const popupVisible = !!popup && shown(popup);
  const allOptions = popup ? Array.from(popup.querySelectorAll('[role~="option"]')) : [];
  const options = allOptions.filter(shown);
  const activeEl = idRef(input, 'aria-activedescendant') ?? idRef(combo, 'aria-activedescendant');
  const focused = document.activeElement;
  return {
    input: h.selector(input),
    editable: isField(input),
    tabbable: input.tabIndex >= 0 && shown(input),
    popupVisible,
    expanded: combo.getAttribute('aria-expanded') ?? input.getAttribute('aria-expanded'),
    options: popupVisible ? options.length : 0,
    firstOptionText: (allOptions[0]?.textContent ?? '').trim(),
    activeOption: activeEl && activeEl.matches('[role~="option"]') ? h.selector(activeEl) : null,
    focusedOption: focused && focused.matches('[role~="option"]') ? h.selector(focused) : null,
    look: options
      .map((o) => `${o.getAttribute('class') ?? ''}|${o.getAttribute('style') ?? ''}`)
      .join(';'),
    value:
      input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
        ? input.value
        : (input.textContent ?? '').trim(),
  };
}

const navStep = (key: string, r: ComboRead): ComboNavStep => ({
  key,
  activeOption: r.activeOption,
  focusedOption: r.focusedOption,
  look: r.look,
});

/** APG combobox: open with the keyboard, move through options, Enter and Escape. */
export async function runCombobox(drv: Driver, widget: Widget): Promise<Problem[]> {
  const arg = { combobox: widget.selector, popup: widget.related ?? null };
  const read = async () => {
    const r = await drv.evaluate(readCombobox, arg);
    if (!r) throw new Error(`combobox ${widget.selector} disappeared`);
    return r;
  };
  await drv.fresh();
  const initial = await read();
  if (initial.popupVisible) return []; // always-open list: nothing to open

  const typed = (initial.firstOptionText.charAt(0) || 'a').toLowerCase();
  const doOpen = async (method: ComboOpenMethod) => {
    await drv.fresh();
    if (method === 'click') {
      await drv.click(initial.input);
      return;
    }
    await drv.focus(initial.input);
    if (method === 'typing') await drv.type(typed);
    else await drv.press(method);
  };
  const methods: ComboOpenMethod[] = ['ArrowDown', 'Alt+ArrowDown', 'typing', 'click'];
  const opens = {} as Record<ComboOpenMethod, boolean>;
  for (const m of methods) {
    if (m === 'typing' && !initial.editable) {
      opens[m] = false;
      continue;
    }
    await doOpen(m);
    opens[m] = (await read()).popupVisible;
  }

  const obs: ComboboxObservation = {
    combobox: widget.selector,
    tabbable: initial.tabbable,
    opens,
    expandedWhenOpen: null,
    options: 0,
    nav: [],
    enter: null,
    escape: null,
  };
  const kb = methods.find((m) => m !== 'click' && opens[m]);
  if (kb) {
    await doOpen(kb);
    const open = await read();
    obs.expandedWhenOpen = open.expanded;
    obs.options = open.options;
    obs.nav = [navStep('open', open)];
    for (let i = 0; i < 2; i++) {
      await drv.press('ArrowDown');
      obs.nav.push(navStep('ArrowDown', await read()));
    }
    const before = (await read()).value;
    try {
      await drv.press('Enter');
      const after = await read();
      obs.enter = { popupVisible: after.popupVisible, valueChanged: after.value !== before };
    } catch {
      obs.enter = null; // Enter submitted a form: we cannot judge it
    }
    await doOpen(kb);
    await drv.press('Escape');
    obs.escape = { popupVisible: (await read()).popupVisible };
  }
  return evaluateCombobox(obs);
}
