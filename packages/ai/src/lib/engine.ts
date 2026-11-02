import { randomBytes } from 'node:crypto';
import { captureElement, type Engine, type PageContext } from '@clear-a11y/browser';
import type { ClearA11yConfig, Finding } from '@clear-a11y/core';
import { parseAiOptions, type AiOptions, type JudgeId } from './config.js';
import { buildPrompt } from './delimit.js';
import { AiConfigError, AiProviderError } from './errors.js';
import { findInstructionLikeText } from './injection-guard.js';
import { JUDGES, judgeById } from './judges/index.js';
import type { Candidate, Judge } from './judges/types.js';
import { loadPrompt } from './prompts.js';
import type { AiProvider, CompletionRequest } from './providers/types.js';
import { recordingKey } from './recording-key.js';
import { verdictToFinding, type JudgeOutcome } from './to-finding.js';
import { parseVerdict, VERDICT_JSON_SCHEMA } from './verdict.js';

export const ENGINE_NAME = 'ai-judges';

/** Version of the shared system prompt (prompts/system.v<N>.md). */
export const SYSTEM_PROMPT_VERSION = 1;

/** Screenshot crops per page for likely findings. */
const MAX_SCREENSHOTS = 5;

export interface AiEngineOptions {
  /** Judges to run (ids or custom judges). Defaults to `ai.judges` or every built-in judge. */
  judges?: readonly (JudgeId | Judge)[];
  /** Nonce for the data-block delimiter. Defaults to a random value per request. */
  nonce?: () => string;
}

export interface AiEngine extends Engine {
  /** Model requests made so far by this engine instance (the per-scan cap counts these). */
  calls(): number;
}

export interface PreparedRequest {
  judge: Judge;
  candidate: Candidate;
  injection?: string;
  request: CompletionRequest;
}

/** Builds the model request for one candidate. Page data only ever goes inside the data block. */
export function prepareRequest(
  judge: Judge,
  candidate: Candidate,
  options: Pick<AiOptions, 'maxTokens'>,
  nonce: string,
): PreparedRequest {
  const system = loadPrompt('system', SYSTEM_PROMPT_VERSION).body;
  const template = loadPrompt(judge.id, judge.promptVersion).body;
  const injection = findInstructionLikeText(candidate.input);
  return {
    judge,
    candidate,
    ...(injection ? { injection } : {}),
    request: {
      system,
      prompt: buildPrompt(template, candidate.input, nonce),
      ...(candidate.image ? { images: [candidate.image] } : {}),
      maxTokens: options.maxTokens,
      jsonSchema: VERDICT_JSON_SCHEMA,
      meta: {
        judge: judge.id,
        promptVersion: judge.promptVersion,
        key: recordingKey(judge.id, candidate.input),
        input: candidate.input,
      },
    },
  };
}

const randomNonce = () => randomBytes(9).toString('hex');

async function pool<T>(items: readonly T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
    }),
  );
}

/**
 * The AI judges as one engine. Deterministic code selects candidates (capped per judge and per
 * page), each candidate becomes one schema-constrained question to the configured model, and
 * the answer maps to a `likely` or `needs-review` finding whose engine is `ai-<judge>`.
 * Nothing runs, and nothing is sent, when the provider is `none`.
 */
export function createAiEngine(
  config: Pick<ClearA11yConfig, 'ai'>,
  provider: AiProvider,
  engineOptions: AiEngineOptions = {},
): AiEngine {
  const options = parseAiOptions(config.ai);
  const judges: Judge[] = (
    engineOptions.judges ?? (options.judges.length ? options.judges : JUDGES)
  ).map((j) => (typeof j === 'string' ? judgeById(j) : j));
  const nonce = engineOptions.nonce ?? randomNonce;
  let calls = 0;
  let disabledReason: string | undefined;

  return {
    name: ENGINE_NAME,
    mutatesPage: false,
    calls: () => calls,
    async run(ctx: PageContext): Promise<Finding[]> {
      if (!provider.available) return [];
      if (disabledReason) {
        ctx.log.debug('ai judges disabled for this scan', { reason: disabledReason });
        return [];
      }
      const started = Date.now();
      const budgetMs = options.budgetMs ?? Math.max(5_000, Math.floor(ctx.config.timeoutMs * 0.8));
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), budgetMs);
      try {
        // 1. Deterministic candidate selection (sequential: it reads the live page).
        const prepared: PreparedRequest[] = [];
        for (const judge of judges.filter((j) => j.runsIn(ctx))) {
          let candidates: Candidate[] = [];
          try {
            candidates = await judge.select(ctx, {
              limit: options.maxCandidatesPerJudge,
              images: options.images,
            });
          } catch (err) {
            ctx.log.warn(`ai ${judge.id}: candidate selection failed`, { error: String(err) });
          }
          for (const c of candidates) prepared.push(prepareRequest(judge, c, options, nonce()));
        }
        const pageCap = Math.min(options.maxCallsPerPage, options.maxCallsPerScan - calls);
        const toSend = prepared.slice(0, Math.max(0, pageCap));
        if (prepared.length > toSend.length) {
          ctx.log.info('ai judges: candidate cap reached', {
            candidates: prepared.length,
            sent: toSend.length,
          });
        }
        calls += toSend.length;
        // Over the cap: guard-flagged candidates still get their deterministic finding.
        const outcomes = new Map<PreparedRequest, JudgeOutcome>();
        for (const p of prepared.slice(toSend.length)) {
          outcomes.set(p, { kind: 'error', error: 'not sent: call cap reached' });
        }

        // 2. Model requests (no page access), a few in flight at a time.
        let warned = false;
        await pool(toSend, options.concurrency, async (p) => {
          if (deadline.signal.aborted || disabledReason) {
            outcomes.set(p, { kind: 'error', error: 'not sent: time budget used' });
            return;
          }
          try {
            const res = await provider.complete({ ...p.request, signal: deadline.signal });
            const parsed = parseVerdict(res.text);
            outcomes.set(
              p,
              parsed.ok
                ? { kind: 'verdict', verdict: parsed.verdict, model: res.model }
                : { kind: 'invalid', error: parsed.error, model: res.model },
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            outcomes.set(p, { kind: 'error', error: message });
            if (err instanceof AiConfigError || (err instanceof AiProviderError && err.fatal)) {
              disabledReason = message;
            }
            if (!warned) {
              warned = true;
              ctx.log.warn(`ai ${p.judge.id}: model request failed`, { error: message });
            }
          }
        });

        // 3. Map outcomes to findings.
        const page = { url: ctx.url, state: ctx.state, viewport: ctx.viewport.name };
        const findings: Finding[] = [];
        for (const p of prepared) {
          const f = verdictToFinding({
            judge: p.judge,
            candidate: p.candidate,
            outcome: outcomes.get(p) ?? { kind: 'error', error: 'no outcome' },
            ...(p.injection ? { injection: p.injection } : {}),
            page,
            provider: provider.name,
            likelyThreshold: options.likelyThreshold,
            reportUncertain: options.reportUncertain,
          });
          if (f) findings.push(f);
        }
        let shots = 0;
        for (const f of findings) {
          if (f.tier !== 'likely' || shots >= MAX_SCREENSHOTS) continue;
          const shot = await captureElement(ctx, f.target.selector, f.ruleId.replace('/', '-'));
          if (shot) {
            f.evidence.screenshot = shot;
            shots++;
          }
        }
        ctx.log.debug('ai judges done', {
          url: ctx.url,
          state: ctx.state,
          sent: toSend.length,
          findings: findings.length,
          ms: Date.now() - started,
        });
        return findings;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
