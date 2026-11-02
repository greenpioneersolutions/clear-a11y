import type { FocusStop } from '@clear-a11y/core';

/** How the persona perceives and operates the page. */
export const CONSTRAINTS = ['keyboard-only', 'screen-reader'] as const;
export type Constraint = (typeof CONSTRAINTS)[number];

/** The only keys a persona may press. No mouse, no coordinates. */
export const KEYS = [
  'Tab',
  'Shift+Tab',
  'Enter',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Escape',
  'Home',
  'End',
] as const;
export type Key = (typeof KEYS)[number];

/**
 * One action a planner can choose.
 * - `press` / `type`: both constraints (`type` writes into the focused field).
 * - `activate` / `focus`: screen-reader only. `ref` names a node of the accessibility tree
 *   snapshot (never a selector or coordinates): `activate` is the screen reader's default action
 *   (Enter in browse mode), `focus` moves the virtual cursor / system focus to the node.
 * - `done`: the planner believes the task is complete (the success condition decides).
 * - `give_up`: the planner is stuck; `cause` says why.
 */
export type PersonaAction =
  | { type: 'press'; key: Key; reason?: string }
  | { type: 'type'; text: string; ref?: string; reason?: string }
  | { type: 'activate'; ref: string; reason?: string }
  | { type: 'focus'; ref: string; reason?: string }
  | { type: 'done'; reason?: string }
  | { type: 'give_up'; cause: BlockCause; reason: string; ref?: string };

/**
 * Why a persona got stuck. Each cause maps to WCAG success criteria in `to-finding.ts`.
 * - `unreachable`: the target is visible on screen but Tab never reaches it (2.1.1).
 * - `not-operable`: the target has focus (or is exposed) but Enter/Space/activate do nothing.
 * - `trap`: focus circles inside a group that doesn't contain the target, Escape doesn't help (2.1.2).
 * - `focus-lost`: after an action focus fell back to the page body and the task then failed (2.4.3).
 * - `unnamed`: the screen reader finds controls of the right role, but without a name (4.1.2).
 * - `not-exposed`: the target is visible but absent from the accessibility tree (4.1.2, 1.3.1).
 * - `target-not-found`: the target named in the task is neither visible nor exposed.
 * - `budget`: `maxSteps` used up.
 * - `success-not-met`: every step ran but the success condition never became true.
 * - `planner-gave-up` / `invalid-output`: the AI planner gave up or kept answering nonsense.
 */
export const BLOCK_CAUSES = [
  'unreachable',
  'not-operable',
  'trap',
  'focus-lost',
  'unnamed',
  'not-exposed',
  'target-not-found',
  'budget',
  'success-not-met',
  'planner-gave-up',
  'invalid-output',
] as const;
export type BlockCause = (typeof BLOCK_CAUSES)[number];

/** The focused element as a keyboard user experiences it (what has focus and what it says). */
export interface FocusedInfo {
  selector: string;
  role: string;
  /** Visible label or text (falls back to aria-label, title, placeholder). */
  name: string;
  tag: string;
  /** Checked / expanded / pressed / value signature, so toggles count as a change. */
  state: string;
  visible: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

/** One node of the screen reader's view (accessibility tree), addressed by `ref`. */
export interface SrNode {
  /**
   * `n<position>` in this snapshot's outline (n1, n2...): valid until the page changes, never a
   * CSS selector. Positions are deterministic for a given page state, so recordings can use them.
   */
  ref: string;
  /** DOM backend node id behind the node (internal: never sent to a model). */
  backendId: number;
  role: string;
  name: string;
  /** Depth in the tree (for outlines). */
  depth: number;
  focusable: boolean;
  focused: boolean;
  /** Shown states, e.g. `checked`, `expanded=false`, `disabled`. */
  states: string[];
}

export interface KeyboardObservation {
  constraint: 'keyboard-only';
  url: string;
  focused: FocusedInfo | null;
  /** Visible text on screen (headings, labels, buttons...), capped. What a sighted user sees. */
  screen: string[];
  /** Did the previous action change anything (DOM, URL, focus, control state)? */
  changed: boolean;
}

export interface SrObservation {
  constraint: 'screen-reader';
  url: string;
  nodes: SrNode[];
  /** `ref` of the node with focus, when focus is on an exposed node. */
  focusedRef?: string;
  changed: boolean;
}

export type Observation = KeyboardObservation | SrObservation;

/** One recorded step of a persona run: what it did, where focus was, what happened. */
export interface TraceStep {
  n: number;
  /** e.g. "press Tab", "type \"a@example.test\"", "activate n42 (button \"Sign up\")", "give_up". */
  action: string;
  /** Focused element after the action (keyboard) or the node acted on (screen reader). */
  focused?: { selector?: string; role: string; name: string } | null;
  /** "moved", "no change", "changed", "url changed", "focus lost", "rejected: ...", ... */
  result: string;
  reason?: string;
}

export interface PersonaPlanner {
  readonly kind: 'deterministic' | 'ai';
  next(obs: Observation, trace: readonly TraceStep[]): Promise<PersonaAction>;
  /** Index of the step hint being worked on (deterministic planners). */
  hintIndex?(): number;
}

export interface PersonaBlock {
  cause: BlockCause;
  reason: string;
  /** Selector of the blocking element, when known. */
  selector?: string;
  role?: string;
  name?: string;
  /** Index of the step hint the persona was working on. */
  hint?: number;
  /** A deterministic, measurable fact backs the cause (e.g. a visible control that never got focus). */
  measured: boolean;
}

export type PersonaOutcome =
  { status: 'success'; steps: number } | { status: 'blocked'; steps: number; block: PersonaBlock };

export interface PersonaRun {
  taskId: string;
  constraint: Constraint;
  planner: 'deterministic' | 'ai';
  outcome: PersonaOutcome;
  trace: TraceStep[];
  /** Keyboard runs: the focus stops in order. */
  focusPath: FocusStop[];
  /** Instruction-like page text the AI planner saw (treated as data). */
  injection?: string;
  /** Provider and model, for AI runs. */
  provider?: string;
  model?: string;
}
