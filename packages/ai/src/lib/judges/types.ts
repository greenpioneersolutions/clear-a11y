import type { PageContext } from '@clear-a11y/browser';
import type { FocusStop } from '@clear-a11y/core';
import type { JudgeId } from '../config.js';
import type { CompletionImage } from '../providers/types.js';
import type { Verdict } from '../verdict.js';

/** One thing a judge asks the model about. */
export interface Candidate {
  /** Finding target, from `window.__clearA11y.selector` so it lines up with other engines. */
  selector: string;
  role?: string;
  name?: string;
  /** Short HTML snippet for evidence. Never sent to the model. */
  html?: string;
  /** The page data sent to the model (inside the delimited data block). Untrusted. */
  input: Record<string, unknown>;
  /** Screenshot crop, only when the judge uses vision and `ai.images` is on. */
  image?: CompletionImage;
  /** Focus path evidence (focus-order judge). */
  focusPath?: FocusStop[];
}

export interface SelectOptions {
  /** Max candidates to return. */
  limit: number;
  /** Whether screenshot crops may be captured. */
  images: boolean;
}

export interface Judge {
  id: JudgeId;
  wcag: string[];
  title: string;
  /** Prompt file version: prompts/<id>.v<promptVersion>.md */
  promptVersion: number;
  fix: string;
  /** Which page states the judge runs in. */
  runsIn(ctx: Pick<PageContext, 'state' | 'stateMeta'>): boolean;
  /** Deterministic candidate extraction from the live page. Read-only. */
  select(ctx: PageContext, options: SelectOptions): Promise<Candidate[]>;
  /** "This image", "This link"... used in messages. */
  subject(c: Candidate): string;
  /** Finding message for a `fail` verdict. */
  failMessage(c: Candidate, v: Verdict): string;
  /** The yes/no question a human answers for needs-review findings. */
  question(c: Candidate): string;
}

export const isDefaultState = (ctx: Pick<PageContext, 'state' | 'stateMeta'>): boolean =>
  ctx.state === 'default' && (ctx.stateMeta?.kind ?? 'default') === 'default';

export const quote = (s: unknown, max = 80): string => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return `"${t.length > max ? `${t.slice(0, max - 1)}…` : t}"`;
};
