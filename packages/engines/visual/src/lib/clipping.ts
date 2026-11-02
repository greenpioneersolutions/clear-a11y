/**
 * Measured overflow of an element that clips its content (`overflow: hidden | clip`), collected in
 * the page before and after a change such as text spacing or text resize.
 */
export interface ClipMeasure {
  /** Stable per-page element id (from the in-page probe). */
  id: number;
  selector: string;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  /** `text-overflow: ellipsis` is in effect on this element. */
  ellipsis?: boolean;
}

/** Pixels of content hidden by the clipping box, per axis (0 when nothing is cut off). */
export function hiddenOverflow(m: ClipMeasure, tolerance = 1): { x: number; y: number } {
  const x = m.scrollWidth - m.clientWidth;
  const y = m.scrollHeight - m.clientHeight;
  return { x: x > tolerance ? x : 0, y: y > tolerance ? y : 0 };
}

export interface NewClip {
  before: ClipMeasure;
  after: ClipMeasure;
  /** Extra content hidden after the change, in px. */
  extra: { x: number; y: number };
}

/**
 * Elements that hide more content after a change than before it. Text that was already cut off
 * and is cut off even more also counts: the change made content disappear. Elements that only
 * exist on one side are ignored (the page re-rendered them; we can't compare).
 */
export function newlyClipped(
  before: readonly ClipMeasure[],
  after: readonly ClipMeasure[],
  /** Growth must exceed this many px (sub-pixel and rounding noise stays below it). */
  minExtra = 2,
): NewClip[] {
  const base = new Map(before.map((m) => [m.id, m]));
  const out: NewClip[] = [];
  for (const a of after) {
    const b = base.get(a.id);
    if (!b) continue;
    const hb = hiddenOverflow(b);
    const ha = hiddenOverflow(a);
    const extra = { x: Math.max(0, ha.x - hb.x), y: Math.max(0, ha.y - hb.y) };
    if (extra.x > minExtra || extra.y > minExtra) out.push({ before: b, after: a, extra });
  }
  return out;
}
