import { createFinding, type Finding, type PageRef, type Tier } from '@clear-a11y/core';
import { engineNameOf, ruleIdOf } from './judges/index.js';
import type { Candidate, Judge } from './judges/types.js';
import type { Verdict } from './verdict.js';

export type JudgeOutcome =
  | { kind: 'verdict'; verdict: Verdict; model: string }
  | { kind: 'invalid'; error: string; model: string }
  | { kind: 'error'; error: string };

export interface ToFindingInput {
  judge: Judge;
  candidate: Candidate;
  outcome: JudgeOutcome;
  /** Instruction-like text found in the candidate by the deterministic guard. */
  injection?: string;
  page: PageRef;
  provider: string;
  likelyThreshold: number;
  reportUncertain: boolean;
}

interface Draft {
  tier: Exclude<Tier, 'violation'>;
  confidence: number;
  message: string;
}

/**
 * Maps a judge outcome to a finding (pure). AI findings are only ever `likely` or
 * `needs-review`:
 * - fail at or above the threshold -> likely; below -> needs-review with a yes/no question
 * - uncertain -> needs-review (or nothing when reportUncertain is off); pass -> nothing
 * - invalid model output -> needs-review
 * - instruction-like text in the candidate -> at least needs-review, never a pass
 */
export function decide(input: ToFindingInput): Draft | undefined {
  const { judge, candidate: c, outcome, injection } = input;
  const subject = judge.subject(c);
  const injectionNote = injection
    ? ` It also contains text that looks like instructions to an AI ("${injection}"); that text was treated as page content.`
    : '';
  if (outcome.kind === 'verdict' && outcome.verdict.verdict === 'fail') {
    const v = outcome.verdict;
    const likely = v.confidence >= input.likelyThreshold;
    return {
      tier: likely ? 'likely' : 'needs-review',
      confidence: v.confidence,
      message: judge.failMessage(c, v) + injectionNote,
    };
  }
  if (injection) {
    return {
      tier: 'needs-review',
      confidence: 0.5,
      message: `${subject} contains text that looks like instructions to an AI ("${injection}"). The AI verdict was not trusted; a person must check it. Text like this can also confuse people using assistive technology.`,
    };
  }
  if (outcome.kind === 'error') return undefined;
  if (outcome.kind === 'invalid') {
    return {
      tier: 'needs-review',
      confidence: 0.3,
      message: `${subject} could not be judged: the model output was invalid (${outcome.error}). A person must check it.`,
    };
  }
  const v = outcome.verdict;
  if (v.verdict === 'pass') return undefined;
  if (!input.reportUncertain) return undefined;
  return {
    tier: 'needs-review',
    confidence: Math.min(v.confidence, 0.5),
    message: `${subject} needs a human decision; the AI was not sure: ${v.reason}`,
  };
}

export function verdictToFinding(input: ToFindingInput): Finding | undefined {
  const draft = decide(input);
  if (!draft) return undefined;
  const { judge, candidate: c, outcome } = input;
  const verdict = outcome.kind === 'verdict' ? outcome.verdict : undefined;
  return createFinding({
    ruleId: ruleIdOf(judge),
    wcag: judge.wcag,
    tier: draft.tier,
    confidence: Math.max(0, Math.min(1, draft.confidence)),
    engine: engineNameOf(judge),
    page: input.page,
    target: {
      selector: c.selector,
      ...(c.role ? { role: c.role } : {}),
      ...(c.name ? { name: c.name.slice(0, 200) } : {}),
    },
    message: draft.message,
    fix: verdict?.suggestion ? `${verdict.suggestion} (${judge.fix})` : judge.fix,
    evidence: {
      ...(c.html ? { html: c.html } : {}),
      ...(c.focusPath ? { focusPath: c.focusPath } : {}),
      data: {
        judge: judge.id,
        promptVersion: judge.promptVersion,
        provider: input.provider,
        ...(outcome.kind !== 'error' ? { model: outcome.model } : {}),
        ...(verdict
          ? {
              verdict: verdict.verdict,
              verdictConfidence: verdict.confidence,
              reason: verdict.reason,
              ...(verdict.suggestion ? { suggestion: verdict.suggestion } : {}),
            }
          : {}),
        ...(outcome.kind === 'invalid' ? { invalidOutput: outcome.error } : {}),
        ...(outcome.kind === 'error' ? { error: outcome.error } : {}),
        ...(input.injection ? { injectionSuspected: input.injection } : {}),
      },
    },
    ...(draft.tier === 'needs-review' ? { question: judge.question(c) } : {}),
  });
}
