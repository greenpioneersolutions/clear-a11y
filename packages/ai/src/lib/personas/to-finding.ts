import { createFinding, type Finding, type PageRef, type RuleMeta } from '@clear-a11y/core';
import type { PersonaTask } from './config.js';
import type { BlockCause, Constraint, PersonaRun } from './types.js';

export const PERSONA_RULE_ID = 'persona/task-blocked';

export const personaEngineName = (constraint: Constraint) => `persona-${constraint}`;

/** Rule metadata for docs and reports. Persona findings are never violations. */
export const personaRule: RuleMeta = {
  id: PERSONA_RULE_ID,
  engine: 'persona-keyboard-only',
  wcag: ['2.1.1', '2.1.2', '2.4.3', '4.1.2'],
  tier: 'likely',
  title: 'Persona could not complete the task',
  description:
    'A persona (keyboard-only or screen-reader) tried to complete a task declared in config and got stuck. The finding names the blocking element, the cause, and carries the full step trace. Likely when a measured fact backs the cause (a visible control Tab never reaches, an unnamed control), otherwise needs-review.',
  fix: 'Fix the blocking element so the task works with the keyboard alone and through the accessibility tree: use native controls (button, a href, input) or add tabindex, key handlers, a role and an accessible name; keep focus on or near the control after it changes the page.',
};

/** WCAG success criteria per cause. The first is the primary one. */
export function wcagFor(cause: BlockCause, constraint: Constraint): string[] {
  switch (cause) {
    case 'unreachable':
      return ['2.1.1'];
    case 'not-operable':
      return constraint === 'keyboard-only' ? ['2.1.1'] : ['4.1.2'];
    case 'trap':
      return ['2.1.2'];
    case 'focus-lost':
      return ['2.4.3'];
    case 'unnamed':
      return ['4.1.2'];
    case 'not-exposed':
      return ['4.1.2', '1.3.1'];
    default:
      return constraint === 'keyboard-only' ? ['2.1.1'] : ['4.1.2'];
  }
}

const WHO: Record<Constraint, string> = {
  'keyboard-only': 'A keyboard-only user',
  'screen-reader': 'A screen reader user',
};

const FIX: Record<BlockCause, string> = {
  unreachable:
    'Make the control focusable and operable with the keyboard: use a native button or link, or add tabindex="0", a role and Enter/Space handlers.',
  'not-operable':
    'Make the control respond to Enter and Space (native buttons do this), not only to mouse clicks.',
  trap: 'Let Tab and Shift+Tab move out of the component, or close it with Escape and return focus to the control that opened it.',
  'focus-lost':
    'When an action removes or replaces the focused element, move focus to the new content (or back to the control) instead of letting it fall to the page body.',
  unnamed:
    'Give the control an accessible name that says what it does (visible text, aria-label or aria-labelledby).',
  'not-exposed':
    'Expose the control to assistive technology: remove aria-hidden or role="presentation" from it and use a native element with a name.',
  'target-not-found':
    'Check that the control the task needs is present, visible and named the way the task describes it.',
  budget:
    'Check that the task can be completed in a reasonable number of key presses (skip links, landmarks, logical order).',
  'success-not-met':
    'Check that completing the task gives a visible, announced result and that every step works without a mouse.',
  'planner-gave-up':
    'Review the step trace to see where the persona got lost, and try the task yourself under the same constraint.',
  'invalid-output':
    'The AI planner could not produce valid actions. Try the task yourself under the same constraint.',
};

export interface PersonaFindingInput {
  run: PersonaRun;
  task: Pick<PersonaTask, 'id' | 'goal' | 'constraint'>;
  page: PageRef;
  /** Path of the saved trace artifact, if one was written. */
  traceArtifact?: string;
}

/**
 * Maps a blocked persona run to a finding (pure). Success maps to nothing. Tier is `likely` when
 * the deterministic planner was blocked and a measured fact backs the cause, otherwise
 * `needs-review` with a yes/no question. Never `violation`: persona engines are AI-tier.
 */
export function personaRunToFinding(input: PersonaFindingInput): Finding | undefined {
  const { run, task } = input;
  if (run.outcome.status === 'success') return undefined;
  const b = run.outcome.block;
  const likely = run.planner === 'deterministic' && b.measured && !run.injection;
  const who = WHO[task.constraint];
  const where = b.name ? ` at "${b.name}"` : b.selector ? ` at ${b.selector}` : '';
  const injectionNote = run.injection
    ? ` The page contains text that looks like instructions to an AI ("${run.injection}"); it was treated as page content.`
    : '';
  const artifactNote = input.traceArtifact ? ` Full trace: ${input.traceArtifact}.` : '';
  return createFinding({
    ruleId: PERSONA_RULE_ID,
    wcag: wcagFor(b.cause, task.constraint),
    tier: likely ? 'likely' : 'needs-review',
    confidence: likely ? 0.8 : 0.5,
    engine: personaEngineName(task.constraint),
    page: input.page,
    target: {
      selector: b.selector ?? 'body',
      ...(b.role ? { role: b.role } : {}),
      ...(b.name ? { name: b.name.slice(0, 200) } : {}),
    },
    message: `${who} could not complete the task "${task.goal}": stuck${where} after ${run.outcome.steps} step(s) (${b.cause}). ${b.reason}${injectionNote}${artifactNote}`,
    fix: FIX[b.cause],
    evidence: {
      ...(run.focusPath.length ? { focusPath: run.focusPath } : {}),
      data: {
        task: task.id,
        goal: task.goal,
        constraint: task.constraint,
        planner: run.planner,
        cause: b.cause,
        ...(b.hint !== undefined ? { stepHint: b.hint } : {}),
        steps: run.outcome.steps,
        trace: run.trace,
        ...(input.traceArtifact ? { traceArtifact: input.traceArtifact } : {}),
        ...(run.provider ? { provider: run.provider } : {}),
        ...(run.model ? { model: run.model } : {}),
        ...(run.injection ? { injectionSuspected: run.injection } : {}),
      },
    },
    ...(likely
      ? {}
      : {
          question: `Could ${who.charAt(0).toLowerCase()}${who.slice(1)} complete "${task.goal}" on this page?`,
        }),
  });
}
