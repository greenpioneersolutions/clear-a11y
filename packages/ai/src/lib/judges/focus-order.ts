import type { FocusStop, Rect } from '@clear-a11y/core';
import { ensureToolkit } from './page-toolkit.js';
import { isDefaultState, type Judge } from './types.js';

export interface PathStop {
  index: number;
  selector: string;
  name: string;
  role: string;
  rect: Rect;
}

const MAX_STOPS = 40;
/** Pixels of tolerance before a move counts as going up or left. */
const SLACK = 5;

const overlapsVertically = (a: Rect, b: Rect) =>
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;

/** True when `next` is visually before `prev` in reading order (above it, or left of it on the same row). */
export function isBackwardMove(prev: Rect, next: Rect): boolean {
  if (next.y + next.height <= prev.y - SLACK) return true;
  return overlapsVertically(prev, next) && next.x + next.width <= prev.x - SLACK;
}

/**
 * Non-linear layouts are where the sequential order needs a judgment call: the path moves
 * backward in reading order, or it switches between side-by-side columns.
 */
export function analyzePath(stops: readonly PathStop[], viewportWidth: number) {
  const backward: number[] = [];
  let columnSwitches = 0;
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!.rect;
    const next = stops[i]!.rect;
    if (isBackwardMove(prev, next)) backward.push(i);
    if (Math.abs(next.x - prev.x) > viewportWidth * 0.3 && !overlapsVertically(prev, next)) {
      columnSwitches++;
    }
  }
  return { backward, columnSwitches, nonLinear: backward.length > 0 || columnSwitches >= 2 };
}

const rounded = (r: Rect): Rect => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  width: Math.round(r.width),
  height: Math.round(r.height),
});

/** The sequential focus order: positive tabindex ascending first, then DOM order (HTML spec). */
export function sequentialOrder<T extends { tabIndex: number; domIndex: number }>(
  items: readonly T[],
): T[] {
  return [...items]
    .filter((i) => i.tabIndex >= 0)
    .sort((a, b) => {
      const pa = a.tabIndex > 0 ? a.tabIndex : Infinity;
      const pb = b.tabIndex > 0 ? b.tabIndex : Infinity;
      return pa - pb || a.domIndex - b.domIndex;
    });
}

export const focusOrderJudge: Judge = {
  id: 'focus-order',
  wcag: ['2.4.3'],
  title: 'Focus order may not preserve meaning in a non-linear layout',
  promptVersion: 1,
  fix: 'Make the DOM order match the visual and task order (remove positive tabindex values, reorder the markup instead of repositioning it with CSS).',
  runsIn: isDefaultState,
  async select(ctx) {
    await ensureToolkit(ctx.page);
    const raw = await ctx.page.evaluate(() => {
      const h = window.__clearA11y!;
      const t = window.__clearA11yAi!;
      const all = Array.from(document.querySelectorAll('*')).filter(
        (el) => h.isFocusable(el) && !t.hidden(el),
      );
      return all.map((el, domIndex) => ({
        domIndex,
        tabIndex: (el as HTMLElement).tabIndex,
        selector: h.selector(el),
        name: t.clean(t.name(el), 60),
        role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
        rect: h.rect(el),
      }));
    });
    const ordered = sequentialOrder(raw).slice(0, MAX_STOPS);
    const stops: PathStop[] = ordered.map((s, index) => ({
      index,
      selector: s.selector,
      name: s.name,
      role: s.role,
      rect: rounded(s.rect),
    }));
    if (stops.length < 3) return [];
    const analysis = analyzePath(stops, ctx.viewport.width);
    if (!analysis.nonLinear) return [];
    const target = stops[analysis.backward[0] ?? 1]!;
    const backward = new Set(analysis.backward);
    const focusPath: FocusStop[] = stops.map((s) => ({
      index: s.index,
      selector: s.selector,
      ...(s.name ? { name: s.name } : {}),
      role: s.role,
      rect: s.rect,
      ...(backward.has(s.index) ? { backward: true } : {}),
    }));
    return [
      {
        selector: target.selector,
        role: target.role,
        name: target.name,
        focusPath,
        input: {
          viewportWidth: ctx.viewport.width,
          stops: stops.map((s) => ({
            index: s.index,
            name: s.name,
            role: s.role,
            x: s.rect.x,
            y: s.rect.y,
            width: s.rect.width,
            height: s.rect.height,
          })),
          backwardMovesAt: analysis.backward,
          columnSwitches: analysis.columnSwitches,
        },
      },
    ];
  },
  subject: () => 'The focus order',
  failMessage: (_c, v) =>
    `The keyboard focus order does not follow a sensible order for this layout: ${v.reason} Keyboard and screen reader users meet the controls in an order that changes their meaning.`,
  question: () =>
    'Does the Tab order on this page follow an order that makes sense for completing its tasks?',
};
