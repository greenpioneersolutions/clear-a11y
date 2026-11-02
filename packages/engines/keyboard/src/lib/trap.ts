export interface FocusCycle {
  /** Index in the sequence where the cycle starts (first visit of the repeated stop). */
  start: number;
  /** Index where the repeat was seen. */
  end: number;
  /** Distinct stops inside the cycle, in visit order. */
  members: string[];
}

/**
 * Finds the first loop in a Tab sequence. `null` entries mean focus left the document
 * (it reached the browser UI or `<body>`), which ends the walk normally: no cycle.
 * A stop that repeats means Tab keeps circling inside `members`.
 */
export function detectCycle(sequence: readonly (string | null)[]): FocusCycle | null {
  const seen = new Map<string, number>();
  for (let i = 0; i < sequence.length; i++) {
    const s = sequence[i];
    if (s === null || s === undefined) return null;
    const first = seen.get(s);
    if (first !== undefined) {
      return { start: first, end: i, members: [...new Set(sequence.slice(first, i) as string[])] };
    }
    seen.set(s, i);
  }
  return null;
}

/** True when the cycle covers fewer stops than the page offers, so some content is unreachable. */
export function isStrictSubset(cycle: FocusCycle, tabbableCount: number): boolean {
  return cycle.members.length < tabbableCount;
}
