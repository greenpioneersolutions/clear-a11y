import { gotoAndSettle, type Engine, type Page, type PageContext } from '@clear-a11y/browser';
import type { ClearA11yConfig, Finding } from '@clear-a11y/core';
import { parseAiOptions } from '../config.js';
import type { AiProvider } from '../providers/types.js';
import { matchesUrl, parsePersonaOptions, type PersonaTask } from './config.js';
import { createAiPlanner } from './planners/ai.js';
import { createKeyboardPlanner, createScreenReaderPlanner } from './planners/deterministic.js';
import { runPersona } from './run-persona.js';
import { personaRunToFinding } from './to-finding.js';
import type { PersonaPlanner, PersonaRun } from './types.js';

export const PERSONA_ENGINE_NAME = 'persona';

export interface PersonaEngine extends Engine {
  /** Runs of the last `run()` call, successes included (traces for reports and tests). */
  lastRuns(): PersonaRun[];
}

export interface PersonaEngineOptions {
  /** Pause after each persona action. Default 50 ms. */
  settleMs?: number;
  nonce?: () => string;
}

/** Tasks whose `match` fits the page URL. */
export function tasksFor(tasks: readonly PersonaTask[], url: string): PersonaTask[] {
  return tasks.filter((t) => matchesUrl(t.match, url));
}

/**
 * Persona agents as one engine (`persona`, mutates the page). On the default state of each page
 * it runs every task whose `match` fits the URL, each on a fresh load: the deterministic planner
 * by default, the AI planner only when the task asks for it and a provider is configured.
 * Blocked tasks become `persona/task-blocked` findings from `persona-<constraint>`; successful
 * tasks produce nothing.
 */
export function createPersonaEngine(
  config: Pick<ClearA11yConfig, 'personas' | 'ai'>,
  provider?: AiProvider,
  engineOptions: PersonaEngineOptions = {},
): PersonaEngine {
  const options = parsePersonaOptions(config.personas);
  const maxTokens = parseAiOptions(config.ai).maxTokens;
  let runs: PersonaRun[] = [];

  const plannerFor = (task: PersonaTask, kind: 'deterministic' | 'ai'): PersonaPlanner =>
    kind === 'ai'
      ? createAiPlanner({
          provider: provider!,
          task,
          maxTokens,
          ...(engineOptions.nonce ? { nonce: engineOptions.nonce } : {}),
        })
      : task.constraint === 'keyboard-only'
        ? createKeyboardPlanner(task.steps)
        : createScreenReaderPlanner(task.steps);

  return {
    name: PERSONA_ENGINE_NAME,
    mutatesPage: true,
    lastRuns: () => runs,
    async run(ctx: PageContext): Promise<Finding[]> {
      runs = [];
      if (ctx.state !== 'default') return [];
      const tasks = tasksFor(options.tasks, ctx.url);
      if (!tasks.length) return [];
      const findings: Finding[] = [];
      const origin = new URL(ctx.url).origin;
      // Personas press Enter on real forms: never let them post to another origin.
      const guard: Parameters<Page['route']>[1] = (route) => {
        const req = route.request();
        const crossOrigin = new URL(req.url()).origin !== origin;
        return req.method() !== 'GET' && crossOrigin ? route.abort() : route.continue();
      };
      await ctx.page.route('**/*', guard);
      try {
        for (const [i, task] of tasks.entries()) {
          const kind = task.planner ?? options.planner;
          if (kind === 'ai' && !provider?.available) {
            ctx.log.warn(`persona ${task.id}: the AI planner needs ai.provider; task skipped`);
            continue;
          }
          if (i > 0) await gotoAndSettle(ctx.page, ctx.url, ctx.config.timeoutMs);
          const planner = plannerFor(task, kind);
          let run: PersonaRun;
          try {
            run = await runPersona(ctx.page, {
              task,
              planner,
              log: ctx.log,
              ...(engineOptions.settleMs !== undefined ? { settleMs: engineOptions.settleMs } : {}),
            });
          } catch (err) {
            ctx.log.warn(`persona ${task.id} failed`, { error: String(err) });
            continue;
          }
          if (kind === 'ai' && provider) {
            const ai = planner as ReturnType<typeof createAiPlanner>;
            const model = ai.model();
            const injection = ai.injection();
            run = {
              ...run,
              provider: provider.name,
              ...(model ? { model } : {}),
              ...(injection ? { injection } : {}),
            };
          }
          runs.push(run);
          if (run.outcome.status === 'success') continue;
          const traceArtifact = await ctx.artifacts
            .save(
              `persona-${task.id}-trace`,
              new TextEncoder().encode(JSON.stringify(run, null, 2)),
              'json',
            )
            .catch(() => '');
          const f = personaRunToFinding({
            run,
            task,
            page: { url: ctx.url, state: ctx.state, viewport: ctx.viewport.name },
            ...(traceArtifact ? { traceArtifact } : {}),
          });
          if (f) findings.push(f);
        }
      } finally {
        await ctx.page.unroute('**/*', guard).catch(() => undefined);
      }
      return findings;
    },
  };
}
