import type { RuleMeta } from '@clear-a11y/core';
import { list } from '../lib/roving.js';
import type { Problem, Step } from '../lib/types.js';

export const gridKeyboardRule: RuleMeta = {
  id: 'widgets/grid-keyboard',
  engine: 'engine-widgets',
  wcag: ['2.1.1'],
  tier: 'violation',
  title: 'Grid cells can be reached with the arrow keys',
  description:
    'Focuses the tabbable cell of each role="grid" and presses the arrow keys. When the arrow keys do not move focus and cells with controls (or tabindex="-1") are left out of the Tab sequence, keyboard users cannot reach them (2.1.1). Grids that work only with Tab, or that have no focusable cell, are reported for review.',
  fix: 'Follow the ARIA Authoring Practices grid pattern: keep one cell (or the control inside it) at tabindex="0" and the rest at tabindex="-1", and move focus with Left/Right/Up/Down Arrow, Home and End. If the content is a static table, use a plain <table> instead of role="grid".',
};

export interface GridCell {
  selector: string;
  /** The cell (or its focus target) is in the Tab sequence. */
  tabbable: boolean;
  /** The cell has tabindex or contains a control: the author meant it to be focusable. */
  interactive: boolean;
  /** Selector of the focus target (the cell itself, or the control inside it). */
  control?: string;
}

export interface GridObservation {
  grid: string;
  cells: GridCell[];
  /** Arrow walk from the first tabbable cell; `focused` is the cell holding focus. */
  steps: Step[];
}

const base = { ruleId: gridKeyboardRule.id, wcag: ['2.1.1'] };

/** Pure APG grid check. */
export function evaluateGrid(obs: GridObservation): Problem[] {
  if (obs.cells.length < 2) return [];
  const start = obs.steps[0]?.focused ?? null;
  const moved = obs.steps.slice(1).some((s) => s.focused !== null && s.focused !== start);
  if (moved) return [];
  const unreached = obs.cells.filter((c) => !c.tabbable);
  const blocked = unreached.filter((c) => c.interactive);
  if (blocked.length) {
    return [
      {
        ...base,
        tier: 'violation',
        confidence: 0.9,
        selector: obs.grid,
        message: `The arrow keys do not move focus in this grid, and ${list(blocked.map((c) => c.control ?? c.selector))} are not in the Tab sequence, so keyboard users cannot reach them.`,
        data: { blocked: blocked.map((c) => c.control ?? c.selector), steps: obs.steps },
      },
    ];
  }
  if (!obs.cells.some((c) => c.tabbable)) {
    return [
      {
        ...base,
        tier: 'needs-review',
        confidence: 0.5,
        selector: obs.grid,
        message: 'No cell of this grid can be focused, so keyboard users cannot move through it.',
        question:
          'Is this really a static table (so role="grid" should be removed), with nothing keyboard users need to operate?',
      },
    ];
  }
  if (unreached.length === 0) {
    return [
      {
        ...base,
        tier: 'needs-review',
        confidence: 0.5,
        selector: obs.grid,
        message:
          'Every cell is a separate Tab stop and the arrow keys do nothing, unlike the ARIA Authoring Practices grid pattern.',
        question:
          'Is it acceptable that this grid is navigated with Tab only (arrow keys do nothing)?',
      },
    ];
  }
  return [
    {
      ...base,
      tier: 'needs-review',
      confidence: 0.5,
      selector: obs.grid,
      message: `The arrow keys do not move focus in this grid, and cells ${list(unreached.map((c) => c.selector))} cannot be focused.`,
      question:
        'Can keyboard users get to all the information in this grid without the arrow keys?',
    },
  ];
}
