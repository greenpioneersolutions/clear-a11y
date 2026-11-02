import type { RuleMeta } from '@clear-a11y/core';

export const pointerDownActionRule: RuleMeta = {
  id: 'at/pointer-down-action',
  engine: 'engine-at',
  wcag: ['2.5.2'],
  tier: 'likely',
  title: 'Action fires on pointer down',
  description:
    'A control does its job as soon as the mouse button or finger goes down (mousedown, pointerdown or touchstart), with no click or up handler. People with tremors or limited dexterity who touch the wrong thing cannot slide away to cancel, and the action cannot be undone by releasing elsewhere.',
  fix: 'Run the action on click (or pointerup inside the target) instead of on mousedown/pointerdown/touchstart. Native <button> click events already do this.',
};

/** Listener types the engine saw on the element itself. */
export interface PointerDownInput {
  /** Event types with a listener (addEventListener or on* property) on the element. */
  listeners: string[];
  /** Pressing (without releasing) the element changed the page or navigated. */
  changedOnDown: boolean;
}

const DOWN = ['mousedown', 'pointerdown', 'touchstart'];
const UP = ['click', 'mouseup', 'pointerup', 'touchend', 'dblclick'];
const MOVE = ['mousemove', 'pointermove', 'touchmove', 'dragstart'];

/** Elements worth pressing: a down listener, no up/click listener, not a drag handle. */
export function isPointerDownCandidate(listeners: readonly string[]): boolean {
  return (
    listeners.some((t) => DOWN.includes(t)) &&
    !listeners.some((t) => UP.includes(t)) &&
    !listeners.some((t) => MOVE.includes(t))
  );
}

/** Pure analysis for at/pointer-down-action. */
export function detectPointerDownAction(input: PointerDownInput): boolean {
  return isPointerDownCandidate(input.listeners) && input.changedOnDown;
}
