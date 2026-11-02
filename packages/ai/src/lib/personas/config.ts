import { z } from 'zod';
import { AiConfigError } from '../errors.js';
import { CONSTRAINTS } from './types.js';

/**
 * A step hint: one control the task needs, identified the way a person would name it. The
 * deterministic planner tries to reach and operate each hint in order under the constraint.
 *
 * - `name`: case-insensitive substring of the control's accessible name / visible label.
 * - `namePattern`: a case-insensitive regular expression instead of (or as well as) `name`.
 * - `role`: the ARIA role a screen reader announces (`button`, `link`, `textbox`, `checkbox`...).
 *   The screen-reader persona requires it to match; the keyboard persona identifies controls by
 *   what it sees and ignores it.
 * - `action`: `activate` (default: Enter/Space, or the screen reader's default action) or `type`
 *   (write `text` into the field).
 */
export const StepHintSchema = z
  .strictObject({
    role: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    namePattern: z
      .string()
      .min(1)
      .refine((p) => {
        try {
          new RegExp(p, 'i');
          return true;
        } catch {
          return false;
        }
      }, 'namePattern must be a valid regular expression')
      .optional(),
    action: z.enum(['activate', 'type']).default('activate'),
    text: z.string().max(500).optional(),
  })
  .refine((h) => h.name || h.namePattern, { message: 'a step needs name or namePattern' })
  .refine((h) => h.action !== 'type' || h.text !== undefined, {
    message: 'a "type" step needs text',
  });
export type StepHint = z.infer<typeof StepHintSchema>;
export type StepHintInput = z.input<typeof StepHintSchema>;

export const SuccessSchema = z
  .strictObject({
    /** An element matching this selector is visible. */
    selector: z.string().min(1).optional(),
    /** This text is visible on the page (case-insensitive). */
    text: z.string().min(1).optional(),
    /** The page URL contains this. */
    urlIncludes: z.string().min(1).optional(),
  })
  .refine((s) => s.selector || s.text || s.urlIncludes, {
    message: 'success needs selector, text or urlIncludes',
  });
export type SuccessCondition = z.infer<typeof SuccessSchema>;

export const PLANNERS = ['deterministic', 'ai'] as const;
export type PlannerKind = (typeof PLANNERS)[number];

export const PersonaTaskSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/i, 'task id: letters, digits and dashes'),
  /** Natural-language goal ("Add the shoe to the basket"). */
  goal: z.string().min(1).max(500),
  /** Pages the task runs on: a URL substring, or a glob with `*` (any characters). */
  match: z.string().min(1),
  constraint: z.enum(CONSTRAINTS),
  success: SuccessSchema,
  /** Controls to reach and operate, in order. Required for the deterministic planner. */
  steps: z.array(StepHintSchema).max(20).default([]),
  /** Test data the AI planner may type, e.g. { "email": "a@example.test" }. */
  inputs: z.record(z.string(), z.string().max(500)).optional(),
  maxSteps: z.number().int().min(1).max(200).default(40),
  /** Defaults to `personas.planner`. */
  planner: z.enum(PLANNERS).optional(),
});
export type PersonaTask = z.infer<typeof PersonaTaskSchema>;
export type PersonaTaskInput = z.input<typeof PersonaTaskSchema>;

/** The `personas` config section (core keeps it loose; this package validates it). */
export const PersonaOptionsSchema = z
  .looseObject({
    tasks: z.array(PersonaTaskSchema).default([]),
    /** Planner for tasks that don't set one. The AI planner only runs when a provider is configured. */
    planner: z.enum(PLANNERS).default('deterministic'),
  })
  .superRefine((o, ctx) => {
    o.tasks.forEach((t, i) => {
      if ((t.planner ?? o.planner) === 'deterministic' && t.steps.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'a task run by the deterministic planner needs at least one step',
          path: ['tasks', i, 'steps'],
        });
      }
    });
  });
export type PersonaOptions = z.infer<typeof PersonaOptionsSchema>;
export type PersonaOptionsInput = z.input<typeof PersonaOptionsSchema>;

/** Validates the loose `personas` section. Throws `AiConfigError` with readable messages. */
export function parsePersonaOptions(section: unknown = {}): PersonaOptions {
  const parsed = PersonaOptionsSchema.safeParse(section ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `personas.${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new AiConfigError(`Invalid personas config: ${issues}`);
  }
  const ids = parsed.data.tasks.map((t) => t.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new AiConfigError(`Invalid personas config: duplicate task id "${dup}"`);
  return parsed.data;
}

/** True when the section lists at least one task (no validation; used to enable the engine). */
export function hasPersonaTasks(section: unknown): boolean {
  const tasks = (section as { tasks?: unknown } | undefined)?.tasks;
  return Array.isArray(tasks) && tasks.length > 0;
}

/** `match` is a glob when it contains `*` (matched against the whole URL), else a substring. */
export function matchesUrl(match: string, url: string): boolean {
  if (!match.includes('*')) return url.includes(match);
  const source = match
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^(?:.*?)${source}(?:[?#].*)?$`).test(url);
}
