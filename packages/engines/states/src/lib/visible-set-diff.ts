/** One visible element in a snapshot: its in-page key and its parent's key (0 = none). */
export type VisibleEntry = readonly [key: number, parent: number];
/** One element with its own (direct) text: its key and that text. */
export type TextEntry = readonly [key: number, text: string];

export interface Snapshot {
  visible: VisibleEntry[];
  texts: TextEntry[];
}

export interface VisibleSetDiff {
  /** Keys visible after but not before. */
  added: number[];
  /** Keys visible before but not after. */
  removed: number[];
  /** Added keys whose parent was not also added: the top of each revealed subtree. */
  roots: number[];
}

/** Compares two visibility snapshots of the same document. Pure. */
export function visibleSetDiff(
  before: readonly VisibleEntry[],
  after: readonly VisibleEntry[],
): VisibleSetDiff {
  const was = new Set(before.map(([k]) => k));
  const now = new Set(after.map(([k]) => k));
  const added = after.filter(([k]) => !was.has(k));
  const addedSet = new Set(added.map(([k]) => k));
  return {
    added: added.map(([k]) => k),
    removed: before.filter(([k]) => !now.has(k)).map(([k]) => k),
    roots: added.filter(([, parent]) => !addedSet.has(parent)).map(([k]) => k),
  };
}

/** Text that appeared (new element, or an element whose own text changed). Pure. */
export function newTexts(before: readonly TextEntry[], after: readonly TextEntry[]): TextEntry[] {
  const was = new Set(before.map(([k, t]) => `${k}\u0000${t}`));
  return after.filter(([k, t]) => t.trim() !== '' && !was.has(`${k}\u0000${t}`));
}
