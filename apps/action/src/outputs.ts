import { tierAtLeast, type ScanResult } from '@clear-a11y/core';
import type { FailOn } from './inputs.js';

/** Counts for the action outputs. */
export function tierCounts(
  result: ScanResult,
): Record<'violation' | 'likely' | 'needs-review', number> {
  const count = (t: string) => result.findings.filter((f) => f.tier === t).length;
  return {
    violation: count('violation'),
    likely: count('likely'),
    'needs-review': count('needs-review'),
  };
}

/** Findings at or above `failOn` (none when it is "never"). */
export function failingCount(result: ScanResult, failOn: FailOn): number {
  if (failOn === 'never') return 0;
  return result.findings.filter((f) => tierAtLeast(f.tier, failOn)).length;
}

/** The job's failure message, or undefined when the job passes. */
export function failureMessage(result: ScanResult, failOn: FailOn): string | undefined {
  const n = failingCount(result, failOn);
  if (!n) return undefined;
  const noun = failOn === 'violation' ? 'violation' : 'finding';
  const scope = failOn === 'violation' ? '' : ` at or above "${failOn}"`;
  return `Clear A11Y found ${n} ${noun}${n === 1 ? '' : 's'}${scope}. See the job summary and the report.`;
}

/** Hidden marker that identifies our PR comment so later runs update it instead of adding more. */
export const COMMENT_MARKER = '<!-- clear-a11y-summary -->';

export interface CommentOptions {
  token: string;
  /** "owner/repo" (GITHUB_REPOSITORY). */
  repository: string;
  pullRequest: number;
  body: string;
  /** GITHUB_API_URL; defaults to https://api.github.com. */
  apiUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Creates or updates one summary comment on the pull request. Optional and off by default; needs a
 * token with `pull-requests: write`. Fork pull requests get a read-only token, so this fails there
 * (the caller reports it as a warning, never as a failed job).
 */
export async function upsertPrComment(options: CommentOptions): Promise<'created' | 'updated'> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repository))
    throw new Error(`Unexpected GITHUB_REPOSITORY "${options.repository}".`);
  const doFetch = options.fetch ?? fetch;
  const api = (options.apiUrl ?? 'https://api.github.com').replace(/\/+$/, '');
  const headers = {
    authorization: `Bearer ${options.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
  const body = JSON.stringify({ body: `${COMMENT_MARKER}\n${options.body}` });
  const base = `${api}/repos/${options.repository}/issues`;
  const list = await doFetch(`${base}/${options.pullRequest}/comments?per_page=100`, { headers });
  if (!list.ok) throw new Error(`listing comments failed: HTTP ${list.status}`);
  const comments = (await list.json()) as Array<{
    id: number;
    body?: string;
    user?: { type?: string };
  }>;
  // Only our own (bot) comment; a person quoting the marker must not be overwritten.
  const existing = comments.find(
    (c) => c.body?.startsWith(COMMENT_MARKER) && c.user?.type === 'Bot',
  );
  const res = existing
    ? await doFetch(`${base}/comments/${existing.id}`, { method: 'PATCH', headers, body })
    : await doFetch(`${base}/${options.pullRequest}/comments`, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`writing the comment failed: HTTP ${res.status}`);
  return existing ? 'updated' : 'created';
}
