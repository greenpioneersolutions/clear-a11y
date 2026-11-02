import type { RuleMeta } from '@clear-a11y/core';

export const dragWithoutAlternativeRule: RuleMeta = {
  id: 'at/drag-without-alternative',
  engine: 'engine-at',
  wcag: ['2.5.7', '2.5.1'],
  tier: 'needs-review',
  title: 'Dragging or swiping with no single-pointer alternative',
  description:
    'Part of the page is operated by dragging or swiping (draggable items, or pointer/touch move handlers), and there is no button, menu or field next to it that does the same job. People who use a head pointer, eye gaze, a trackball or who have tremors often cannot hold a press while moving. Whether every function also works with single taps is for a human to confirm.',
  fix: 'Add single-tap alternatives next to the drag area: Move up/Move down buttons or a position menu for sortable lists, Previous/Next buttons for carousels, +/- buttons or an input for sliders and maps.',
};

export interface DragInput {
  /** draggable="true" on the item(s). */
  draggable: boolean;
  /** Event types with a listener on the element itself. */
  listeners: string[];
  /** A native form control (range slider, text field) that the browser makes operable. */
  nativeControl: boolean;
  /** A button, select or field (other than the drag target) in the surrounding region. */
  alternative: boolean;
}

const DOWN = ['mousedown', 'pointerdown', 'touchstart'];
const MOVE = ['mousemove', 'pointermove', 'touchmove'];
const DRAG = ['dragstart', 'drop'];

/** Operated by dragging: draggable, HTML drag-and-drop handlers, or down + move handlers. */
export function isDragTarget(input: Pick<DragInput, 'draggable' | 'listeners'>): boolean {
  const has = (types: string[]) => input.listeners.some((t) => types.includes(t));
  return input.draggable || has(DRAG) || (has(DOWN) && has(MOVE));
}

/** Pure analysis for at/drag-without-alternative. */
export function detectDragWithoutAlternative(input: DragInput): boolean {
  return !input.nativeControl && isDragTarget(input) && !input.alternative;
}
