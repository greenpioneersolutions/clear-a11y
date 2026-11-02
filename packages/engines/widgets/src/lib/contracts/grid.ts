import { evaluateGrid, type GridCell } from '../../rules/grid-keyboard.js';
import type { Driver } from '../driver.js';
import type { Problem, Step, Widget } from '../types.js';

const CELLS = '[role~="gridcell"], [role~="columnheader"], [role~="rowheader"]';

/** Runs in the page. */
function readGrid(arg: { grid: string; cells: string }): {
  cells: GridCell[];
  start: string | null;
} {
  const h = window.__clearA11y!;
  const grid = document.querySelector(arg.grid);
  if (!grid) return { cells: [], start: null };
  const FOCUSABLE =
    'a[href], button, input, select, textarea, [tabindex], [contenteditable=""], [contenteditable="true"]';
  const shown = (el: Element) => h.isVisible(el) && !el.closest('[hidden]');
  let start: string | null = null;
  const cells = Array.from(grid.querySelectorAll(arg.cells))
    .filter((c) => c.closest('[role~="grid"], [role~="treegrid"]') === grid && shown(c))
    .map((cell) => {
      const target = (
        cell.hasAttribute('tabindex') ? cell : cell.querySelector(FOCUSABLE)
      ) as HTMLElement | null;
      const tabbable =
        !!target &&
        target.tabIndex >= 0 &&
        shown(target) &&
        !(target as HTMLButtonElement).disabled;
      if (tabbable && !start) start = h.selector(target!);
      return {
        selector: h.selector(cell),
        tabbable,
        interactive: !!target,
        ...(target ? { control: h.selector(target) } : {}),
      };
    });
  return { cells, start };
}

/** Runs in the page: the grid cell holding focus. */
function readFocusedCell(cells: string): string | null {
  const cell = document.activeElement?.closest(cells);
  return cell ? window.__clearA11y!.selector(cell) : null;
}

const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];

/** APG grid: arrow keys move focus between cells. */
export async function runGrid(drv: Driver, widget: Widget): Promise<Problem[]> {
  await drv.fresh();
  const info = await drv.evaluate(readGrid, { grid: widget.selector, cells: CELLS });
  if (info.cells.length < 2) return [];
  const steps: Step[] = [];
  if (info.start) {
    await drv.focus(info.start);
    steps.push({ key: 'start', focused: await drv.evaluate(readFocusedCell, CELLS) });
    for (const key of KEYS) {
      await drv.press(key);
      steps.push({ key, focused: await drv.evaluate(readFocusedCell, CELLS) });
    }
  }
  return evaluateGrid({ grid: widget.selector, cells: info.cells, steps });
}
