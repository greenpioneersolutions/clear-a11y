import { randomBytes } from 'node:crypto';
import { buildPrompt } from '../../delimit.js';
import { findInstructionLikeText } from '../../injection-guard.js';
import { loadPrompt } from '../../prompts.js';
import type { AiProvider, CompletionRequest } from '../../providers/types.js';
import { recordingKey } from '../../recording-key.js';
import { actionJsonSchema, parseModelAction } from '../actions.js';
import type { PersonaTask } from '../config.js';
import type {
  Constraint,
  Observation,
  PersonaAction,
  PersonaPlanner,
  SrNode,
  TraceStep,
} from '../types.js';

/** Versions of the persona prompts (prompts/persona-*.v<N>.md). */
export const PERSONA_PROMPT_VERSION = 1;
export const PERSONA_SYSTEM_PROMPT_VERSION = 1;

/** Steps of history sent with each request. */
const RECENT_STEPS = 8;
/** Lines of screen text / accessibility tree sent with each request. */
const MAX_LINES = 120;

/** Thrown when the model's answer is not a valid action: the executor counts a failed step. */
export class PlannerOutputError extends Error {}

export const promptIdOf = (constraint: Constraint) => `persona-${constraint}`;

function srLine(n: SrNode): string {
  const states = [...(n.focused ? ['focused'] : []), ...n.states];
  return `${'  '.repeat(Math.min(n.depth, 8))}[${n.ref}] ${n.role} "${n.name.slice(0, 120)}"${
    states.length ? ` (${states.join(', ')})` : ''
  }`;
}

/**
 * The page data for one planning request: only what the persona perceives. Keyboard: the
 * focused element and the visible text. Screen reader: the accessibility tree outline. Plus the
 * goal, the page path, the test data the persona may type, and the last few steps.
 */
export function plannerInput(
  task: Pick<PersonaTask, 'goal' | 'inputs'>,
  obs: Observation,
  trace: readonly TraceStep[],
): Record<string, unknown> {
  const recent = trace.slice(-RECENT_STEPS).map((s) => ({ action: s.action, result: s.result }));
  let page = '';
  try {
    // Path only: no origin, query string or fragment goes to the model.
    page = new URL(obs.url).pathname;
  } catch {
    page = '';
  }
  const common = {
    goal: task.goal,
    constraint: obs.constraint,
    page,
    step: trace.length,
    ...(task.inputs ? { inputs: task.inputs } : {}),
    changed: obs.changed,
    recent,
  };
  if (obs.constraint === 'keyboard-only') {
    return {
      ...common,
      focused: obs.focused ? `${obs.focused.role} "${obs.focused.name}"` : null,
      screen: obs.screen.slice(0, MAX_LINES),
    };
  }
  return {
    ...common,
    focusedRef: obs.focusedRef ?? null,
    tree: obs.nodes.slice(0, MAX_LINES).map(srLine),
  };
}

export interface AiPlannerOptions {
  provider: AiProvider;
  task: Pick<PersonaTask, 'goal' | 'inputs' | 'constraint'>;
  maxTokens?: number;
  nonce?: () => string;
}

export interface AiPlanner extends PersonaPlanner {
  /** Model that answered last. */
  model(): string | undefined;
  /** First instruction-like page text seen (treated as data, reported on the finding). */
  injection(): string | undefined;
}

/**
 * The AI planner: asks the configured provider for the next action, with page data only inside
 * the nonce-delimited `<page_data>` block (same hardening as the judges) and a JSON action
 * schema. Only a schema-valid action allowed under the constraint is accepted.
 */
export function createAiPlanner(options: AiPlannerOptions): AiPlanner {
  const { provider, task } = options;
  const constraint = task.constraint;
  const nonce = options.nonce ?? (() => randomBytes(9).toString('hex'));
  const system = loadPrompt('persona-system', PERSONA_SYSTEM_PROMPT_VERSION).body;
  const template = loadPrompt(promptIdOf(constraint), PERSONA_PROMPT_VERSION).body;
  let model: string | undefined;
  let injection: string | undefined;

  return {
    kind: 'ai',
    model: () => model,
    injection: () => injection,
    async next(obs: Observation, trace: readonly TraceStep[]): Promise<PersonaAction> {
      const input = plannerInput(task, obs, trace);
      injection ??= findInstructionLikeText(
        obs.constraint === 'keyboard-only'
          ? [obs.focused?.name ?? '', ...obs.screen]
          : obs.nodes.map((n) => n.name),
      );
      const id = promptIdOf(constraint);
      const req: CompletionRequest = {
        system,
        prompt: buildPrompt(template, input, nonce()),
        maxTokens: options.maxTokens ?? 1_024,
        jsonSchema: actionJsonSchema(constraint),
        meta: {
          judge: id,
          promptVersion: PERSONA_PROMPT_VERSION,
          key: recordingKey(id, input),
          input,
        },
      };
      const res = await provider.complete(req);
      model = res.model;
      const parsed = parseModelAction(res.text, constraint);
      if (!parsed.ok) throw new PlannerOutputError(parsed.error);
      return parsed.action;
    },
  };
}
