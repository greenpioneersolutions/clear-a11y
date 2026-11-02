import { evaluateDialog, type DialogObservation } from '../../rules/dialog-initial-focus.js';
import type { Driver } from '../driver.js';
import type { Problem, Widget } from '../types.js';

/** Dialogs often move focus in a timeout or after a transition: wait this long before judging. */
const OPEN_WAIT_MS = 200;

interface DialogRead {
  open: boolean;
  focusInside: boolean;
  focused: string | null;
  name: string;
}

/** Runs in the page. */
function readDialogs(selectors: string[]): DialogRead[] {
  const h = window.__clearA11y!;
  const active = document.activeElement;
  const focused =
    active && active !== document.body && active !== document.documentElement
      ? h.selector(active)
      : null;
  return selectors.map((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { open: false, focusInside: false, focused, name: '' };
    const isDialogEl = el.tagName.toLowerCase() === 'dialog';
    const open =
      (!isDialogEl || (el as HTMLDialogElement).open) && h.isVisible(el) && !el.closest('[hidden]');
    const labelledby = (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    const name =
      labelledby ||
      (el.getAttribute('aria-label') ?? '').trim() ||
      (el.getAttribute('title') ?? '').trim();
    return { open, focusInside: !!active && el.contains(active), focused, name };
  });
}

const observation = (dialog: string, trigger: string, r: DialogRead): DialogObservation => ({
  dialog,
  trigger,
  opened: r.open,
  focusInside: r.focusInside,
  focused: r.focused,
  name: r.name,
});

/** Opens a dialog from its linked trigger with the keyboard (mouse as a fallback). */
export async function runDialog(drv: Driver, widget: Widget): Promise<Problem[]> {
  if (!widget.trigger) return [];
  await drv.fresh();
  const [initial] = await drv.evaluate(readDialogs, [widget.selector]);
  if (!initial || initial.open) return [];
  await drv.focus(widget.trigger);
  await drv.press('Enter');
  await drv.page.waitForTimeout(OPEN_WAIT_MS);
  let [r] = await drv.evaluate(readDialogs, [widget.selector]);
  if (!r?.open) {
    // Keyboard activation is engine-keyboard's concern; open it with the mouse to check focus.
    await drv.fresh();
    await drv.click(widget.trigger);
    await drv.page.waitForTimeout(OPEN_WAIT_MS);
    [r] = await drv.evaluate(readDialogs, [widget.selector]);
  }
  return r ? evaluateDialog(observation(widget.selector, widget.trigger, r)) : [];
}

/**
 * For hidden dialogs with no linked trigger: press Enter on candidate buttons (never submit
 * buttons) until each dialog has been opened once.
 */
export async function probeOrphanDialogs(
  drv: Driver,
  dialogs: readonly string[],
  buttons: readonly string[],
  maxProbes: number,
  outOfTime: () => boolean,
): Promise<Problem[]> {
  const pending = new Set(dialogs);
  const problems: Problem[] = [];
  for (const button of buttons.slice(0, maxProbes)) {
    if (pending.size === 0 || outOfTime()) break;
    try {
      await drv.fresh();
      await drv.focus(button);
      await drv.press('Enter');
      await drv.page.waitForTimeout(OPEN_WAIT_MS);
      const list = [...pending];
      const reads = await drv.evaluate(readDialogs, list);
      reads.forEach((r, i) => {
        if (!r.open) return;
        pending.delete(list[i]!);
        problems.push(...evaluateDialog(observation(list[i]!, button, r)));
      });
    } catch {
      // The button navigated away or detached: try the next one.
    }
  }
  return problems;
}
