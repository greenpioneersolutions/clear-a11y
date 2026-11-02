import type { Step } from './types.js';

export interface RovingItem {
  selector: string;
  tabbable: boolean;
}

export interface Reachability {
  /** Items that are in the Tab sequence. */
  tabbable: string[];
  /** Items that got focus from an arrow/Home/End key (excluding the start item). */
  byArrows: string[];
  /** Items neither in the Tab sequence nor reached with arrow keys. */
  unreached: string[];
}

/**
 * Pure: which items of a composite widget (tabs, menubar items...) a keyboard user can reach,
 * given the items and a recorded arrow-key walk that started on a tabbable item.
 */
export function reachability(items: readonly RovingItem[], steps: readonly Step[]): Reachability {
  const selectors = new Set(items.map((i) => i.selector));
  const start = steps[0]?.focused ?? null;
  const tabbable = items.filter((i) => i.tabbable).map((i) => i.selector);
  const byArrows = [
    ...new Set(
      steps
        .slice(1)
        .map((s) => s.focused)
        .filter((f): f is string => f !== null && f !== start && selectors.has(f)),
    ),
  ];
  const reached = new Set([...tabbable, ...byArrows, ...(start && tabbable.length ? [start] : [])]);
  return {
    tabbable,
    byArrows,
    unreached: items.map((i) => i.selector).filter((s) => !reached.has(s)),
  };
}

export const list = (selectors: readonly string[], max = 3): string =>
  selectors.length <= max
    ? selectors.map((s) => `"${s}"`).join(', ')
    : `${selectors
        .slice(0, max)
        .map((s) => `"${s}"`)
        .join(', ')} and ${selectors.length - max} more`;
