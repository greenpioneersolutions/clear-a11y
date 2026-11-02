import { evaluateDisclosure, type DisclosureState } from '../../rules/disclosure-keyboard.js';
import type { Driver } from '../driver.js';
import type { Problem, Widget } from '../types.js';

/** Runs in the page. */
function readDisclosure(arg: {
  button: string;
  region: string | null;
}): (DisclosureState & { tabbable: boolean }) | null {
  const h = window.__clearA11y!;
  const button = document.querySelector(arg.button) as HTMLElement | null;
  if (!button) return null;
  const region = arg.region ? document.querySelector(arg.region) : null;
  const shown = (el: Element) => h.isVisible(el) && !el.closest('[hidden]');
  return {
    expanded: button.getAttribute('aria-expanded'),
    regionVisible: region ? shown(region) : null,
    tabbable: button.tabIndex >= 0 && shown(button),
  };
}

/** APG disclosure: Enter, Space and click each on a fresh page; aria-expanded vs visibility. */
export async function runDisclosure(drv: Driver, widget: Widget): Promise<Problem[]> {
  const arg = { button: widget.selector, region: widget.related ?? null };
  await drv.fresh();
  const initial = await drv.evaluate(readDisclosure, arg);
  if (!initial) return [];
  const after = {} as Record<'Enter' | 'Space' | 'click', DisclosureState>;
  for (const action of ['Enter', 'Space', 'click'] as const) {
    await drv.fresh();
    if (action === 'click') await drv.click(widget.selector);
    else {
      await drv.focus(widget.selector);
      await drv.press(action);
    }
    const r = await drv.evaluate(readDisclosure, arg);
    after[action] = r
      ? { expanded: r.expanded, regionVisible: r.regionVisible }
      : { expanded: initial.expanded, regionVisible: initial.regionVisible };
  }
  return evaluateDisclosure({
    button: widget.selector,
    region: widget.related ?? null,
    tabbable: initial.tabbable,
    initial: { expanded: initial.expanded, regionVisible: initial.regionVisible },
    after,
  });
}
