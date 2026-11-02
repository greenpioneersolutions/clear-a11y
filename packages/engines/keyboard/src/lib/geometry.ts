import type { Rect } from '@clear-a11y/core';

/** What the order check needs to know about one focus stop. Rects are in page coordinates. */
export interface StopGeometry {
  rect: Rect;
  /** Layout region (landmark, dialog or fixed container) the stop belongs to. */
  region?: string;
  /** Inside a position: fixed/sticky container, so its page position depends on scroll. */
  fixed?: boolean;
  /** Has a non-empty, on-page box when focused. */
  visible?: boolean;
}

export interface BackwardJumpOptions {
  /** Right-to-left layout: horizontal checks are mirrored. */
  rtl?: boolean;
  /** Pixels a same-row stop must move against the reading direction to count. Default 8. */
  horizontalThreshold?: number;
}

const centerY = (r: Rect) => r.y + r.height / 2;

/** Two boxes are on the same row when their vertical centers are within half the smaller height. */
export function sameRow(a: Rect, b: Rect): boolean {
  const tolerance = Math.min(a.height, b.height) / 2;
  return Math.abs(centerY(a) - centerY(b)) <= tolerance;
}

/** Row index of each rect: rects whose centers fall within the row tolerance share a row. */
export function rowOf(rects: readonly Rect[]): number[] {
  const order = rects.map((r, i) => ({ r, i })).sort((a, b) => centerY(a.r) - centerY(b.r));
  const rows = new Array<number>(rects.length).fill(0);
  let row = -1;
  let anchor: Rect | undefined;
  for (const { r, i } of order) {
    if (!anchor || !sameRow(anchor, r)) {
      row++;
      anchor = r;
    }
    rows[i] = row;
  }
  return rows;
}

/** Indices of `rects` in visual reading order: rows top to bottom, then left to right (LTR). */
export function readingOrder(rects: readonly Rect[], rtl = false): number[] {
  const rows = rowOf(rects);
  return rects
    .map((r, i) => i)
    .sort(
      (a, b) =>
        (rows[a] as number) - (rows[b] as number) ||
        (rtl ? -1 : 1) * ((rects[a] as Rect).x - (rects[b] as Rect).x),
    );
}

/**
 * True when moving focus from `prev` to `next` goes backward against the visual reading order:
 * `next` is a row above `prev`, or on the same row but against the reading direction.
 *
 * Not backward: jumps between different layout regions (landmarks, dialogs, fixed bars), stops
 * without a visible box, and a column wrap (moving up to a column that lies entirely after the
 * previous stop in the reading direction, like the top of the next column in a two-column form).
 */
export function isBackwardJump(
  prev: StopGeometry,
  next: StopGeometry,
  options: BackwardJumpOptions = {},
): boolean {
  if (prev.visible === false || next.visible === false) return false;
  if (prev.fixed || next.fixed) return false;
  if ((prev.region ?? '') !== (next.region ?? '')) return false;
  const a = prev.rect;
  const b = next.rect;
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  const rtl = options.rtl ?? false;
  const threshold = options.horizontalThreshold ?? 8;

  if (sameRow(a, b)) {
    if (rtl) return false; // RTL same-row order is left to the AI judge and humans for now.
    return b.x < a.x - threshold;
  }
  if (centerY(b) > centerY(a)) return false; // moved down: forward
  // Moved up. A column wrap lands entirely after the previous box in the reading direction.
  const columnWrap = rtl ? b.x + b.width <= a.x + threshold : b.x >= a.x + a.width - threshold;
  return !columnWrap;
}
