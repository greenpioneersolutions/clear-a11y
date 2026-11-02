/** Axis-aligned box in CSS px. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const right = (b: Box): number => b.x + b.width;
export const bottom = (b: Box): number => b.y + b.height;
export const center = (b: Box): { x: number; y: number } => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

/** Width and height of the intersection of two boxes (0 when they don't overlap). */
export function intersection(a: Box, b: Box): { width: number; height: number } {
  const width = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const height = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? { width, height } : { width: 0, height: 0 };
}

/**
 * True when two boxes overlap by more than `min` px in both directions. A small minimum ignores
 * anti-aliasing and the 1px touching of adjacent inline boxes.
 */
export function overlaps(a: Box, b: Box, min = 2): boolean {
  const i = intersection(a, b);
  return i.width > min && i.height > min;
}

/** Distance from a point to the nearest point of a box (0 when inside). */
export function distanceToBox(p: { x: number; y: number }, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - right(b));
  const dy = Math.max(b.y - p.y, 0, p.y - bottom(b));
  return Math.hypot(dx, dy);
}

/** WCAG 2.5.8 minimum target size in CSS px. */
export const TARGET_MIN = 24;
/** Tolerance for sub-pixel layout (a 23.999px box is a 24px box). */
const EPS = 0.01;

export function isUndersized(b: Box, min = TARGET_MIN): boolean {
  return b.width < min - EPS || b.height < min - EPS;
}

/**
 * WCAG 2.5.8 spacing exception for one undersized target: a 24px-diameter circle centered on its
 * box must not intersect another target's box, nor the circle of another undersized target.
 * Circles that only touch (distance exactly 24px) do not intersect.
 */
export function failsSpacing(
  target: Box,
  others: readonly { box: Box; undersized: boolean }[],
  min = TARGET_MIN,
): boolean {
  const r = min / 2;
  const c = center(target);
  return others.some((o) => {
    if (distanceToBox(c, o.box) < r - EPS) return true;
    if (!o.undersized) return false;
    const oc = center(o.box);
    return Math.hypot(c.x - oc.x, c.y - oc.y) < 2 * r - EPS;
  });
}

/** Line boxes of one element's own text (or the box of an interactive control). */
export interface TextBox {
  /** Stable per-page element id (from the in-page probe). */
  id: number;
  selector: string;
  kind: 'text' | 'control';
  rects: Box[];
  /** Ids of this element's ancestors, so nested elements are never compared with each other. */
  ancestors: number[];
}

const pairKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Pairs of elements whose text overlaps other text or a control. Two controls are never compared
 * (they are not text), and an element is never compared with its own ancestors or descendants.
 * Returns pair keys "idA|idB" with idA < idB.
 */
export function overlappingPairs(boxes: readonly TextBox[], min = 2): Set<string> {
  const items = boxes.flatMap((b) => b.rects.map((r) => ({ box: b, r })));
  items.sort((p, q) => p.r.x - q.r.x);
  const out = new Set<string>();
  for (const [i, p] of items.entries()) {
    for (let j = i + 1; j < items.length; j++) {
      const q = items[j];
      if (!q) break;
      if (q.r.x >= right(p.r) - min) break;
      if (p.box.id === q.box.id) continue;
      if (p.box.kind === 'control' && q.box.kind === 'control') continue;
      if (p.box.ancestors.includes(q.box.id) || q.box.ancestors.includes(p.box.id)) continue;
      if (overlaps(p.r, q.r, min)) out.add(pairKey(p.box.id, q.box.id));
    }
  }
  return out;
}

/** Overlapping pairs present after a change but not before, among elements present in both. */
export function newOverlaps(
  before: readonly TextBox[],
  after: readonly TextBox[],
  min = 2,
): { a: TextBox; b: TextBox }[] {
  const known = new Set(before.map((b) => b.id));
  const was = overlappingPairs(before, min);
  const byId = new Map(after.map((b) => [b.id, b]));
  const out: { a: TextBox; b: TextBox }[] = [];
  for (const key of overlappingPairs(after, min)) {
    if (was.has(key)) continue;
    const [x, y] = key.split('|').map(Number) as [number, number];
    const a = byId.get(x);
    const b = byId.get(y);
    if (a && b && known.has(x) && known.has(y)) out.push({ a, b });
  }
  return out;
}
