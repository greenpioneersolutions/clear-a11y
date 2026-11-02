import { z } from 'zod';
import { KEYS, type Constraint, type PersonaAction } from './types.js';

const MAX_TEXT = 500;
const REF = /^n\d+$/;

/**
 * Checks that an action is allowed under the constraint. Returns an error message or undefined.
 * A keyboard-only persona can press keys and type, nothing else: no clicks, no focusing by
 * reference. A screen-reader persona may also activate or focus nodes of its accessibility tree.
 */
export function validateAction(action: PersonaAction, constraint: Constraint): string | undefined {
  switch (action.type) {
    case 'press':
      return (KEYS as readonly string[]).includes(action.key)
        ? undefined
        : `key "${String(action.key)}" is not allowed`;
    case 'type':
      if (action.text.length > MAX_TEXT) return `text longer than ${MAX_TEXT} characters`;
      if (action.ref !== undefined && constraint === 'keyboard-only') {
        return 'a keyboard-only persona types into the focused field; it cannot pick a field by reference';
      }
      if (action.ref !== undefined && !REF.test(action.ref))
        return `invalid node ref "${action.ref}"`;
      return undefined;
    case 'activate':
    case 'focus':
      if (constraint === 'keyboard-only') {
        return `a keyboard-only persona cannot ${action.type} elements directly; it can only press keys`;
      }
      return REF.test(action.ref) ? undefined : `invalid node ref "${action.ref}"`;
    case 'done':
    case 'give_up':
      return undefined;
  }
}

/** Human-readable action for the trace. */
export function describeAction(a: PersonaAction): string {
  switch (a.type) {
    case 'press':
      return `press ${a.key}`;
    case 'type':
      return `type ${JSON.stringify(a.text.slice(0, 80))}${a.ref ? ` into ${a.ref}` : ''}`;
    case 'activate':
      return `activate ${a.ref}`;
    case 'focus':
      return `focus ${a.ref}`;
    case 'done':
      return 'done';
    case 'give_up':
      return `give up (${a.cause})`;
  }
}

/** Actions the AI planner may answer with. `give_up` from a model always has cause planner-gave-up. */
export const AI_ACTIONS = {
  'keyboard-only': ['press', 'type', 'done', 'give_up'],
  'screen-reader': ['press', 'type', 'activate', 'focus', 'done', 'give_up'],
} as const;

/** JSON schema sent as the structured-output format for the AI planner. */
export function actionJsonSchema(constraint: Constraint) {
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...AI_ACTIONS[constraint]] },
      key: { type: 'string', enum: [...KEYS] },
      text: { type: 'string' },
      ...(constraint === 'screen-reader' ? { ref: { type: 'string' } } : {}),
      reason: { type: 'string' },
    },
    required: ['action', 'reason'],
    additionalProperties: false,
  } as const;
}

const ModelActionSchema = z.object({
  action: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(['press', 'type', 'activate', 'focus', 'done', 'give_up']),
  ),
  key: z.enum(KEYS).optional(),
  text: z.string().max(MAX_TEXT).optional(),
  ref: z.string().optional(),
  reason: z.string().trim().min(1).max(1_000),
});

export type ParsedAction = { ok: true; action: PersonaAction } | { ok: false; error: string };

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const out = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) out.push(fenced[1]!.trim());
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) out.push(trimmed.slice(first, last + 1));
  return out;
}

/**
 * Parses and validates a model answer into an action. Only the schema fields are read; anything
 * else (a "tier", a "verdict", a selector) is ignored. Invalid answers count as a failed step.
 */
export function parseModelAction(text: string, constraint: Constraint): ParsedAction {
  let error = 'no JSON object found';
  for (const candidate of jsonCandidates(text)) {
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch {
      continue;
    }
    const parsed = ModelActionSchema.safeParse(json);
    if (!parsed.success) {
      error = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      continue;
    }
    const m = parsed.data;
    let action: PersonaAction;
    switch (m.action) {
      case 'press':
        if (!m.key) return { ok: false, error: 'press needs a key' };
        action = { type: 'press', key: m.key, reason: m.reason };
        break;
      case 'type':
        if (m.text === undefined) return { ok: false, error: 'type needs text' };
        action = { type: 'type', text: m.text, ...(m.ref ? { ref: m.ref } : {}), reason: m.reason };
        break;
      case 'activate':
      case 'focus':
        if (!m.ref) return { ok: false, error: `${m.action} needs a ref` };
        action = { type: m.action, ref: m.ref, reason: m.reason };
        break;
      case 'done':
        action = { type: 'done', reason: m.reason };
        break;
      case 'give_up':
        action = {
          type: 'give_up',
          cause: 'planner-gave-up',
          reason: m.reason,
          // Only a tree ref is accepted from a model (never a selector it made up).
          ...(constraint === 'screen-reader' && m.ref && REF.test(m.ref) ? { ref: m.ref } : {}),
        };
        break;
    }
    const invalid = validateAction(action, constraint);
    return invalid ? { ok: false, error: invalid } : { ok: true, action };
  }
  return { ok: false, error };
}
