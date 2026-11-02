import { readFile } from 'node:fs/promises';

/** The commits a run compares, from the workflow event. */
export interface CommitRange {
  base: string;
  head: string;
  /** `merge-base` for pull requests (like "Files changed"), `direct` for pushes. */
  mode: 'merge-base' | 'direct';
  /** Pull request number, for the optional comment. */
  pullRequest?: number;
}

export type EventRange = CommitRange | { error: string };

const SHA = /^[0-9a-f]{7,64}$/i;
const ZERO = /^0+$/;
const isSha = (v: unknown): v is string => typeof v === 'string' && SHA.test(v) && !ZERO.test(v);

interface Payload {
  pull_request?: { number?: unknown; base?: { sha?: unknown }; head?: { sha?: unknown } };
  before?: unknown;
  after?: unknown;
  merge_group?: { base_sha?: unknown; head_sha?: unknown };
}

/**
 * Reads the base and head commits from a GitHub event payload:
 * `pull_request` (base.sha / head.sha), `push` (before / after) and `merge_group`
 * (base_sha / head_sha). Anything else, or missing SHAs (a push that creates a branch has an
 * all-zero `before`), returns an error explaining why.
 */
export function rangeFromEvent(eventName: string, payload: unknown): EventRange {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Payload;
  if (eventName === 'pull_request' || eventName === 'pull_request_target' || p.pull_request) {
    const base = p.pull_request?.base?.sha;
    const head = p.pull_request?.head?.sha;
    if (!isSha(base) || !isSha(head))
      return { error: 'The pull_request event has no base and head commit SHAs.' };
    const n = p.pull_request?.number;
    return {
      base,
      head,
      mode: 'merge-base',
      ...(typeof n === 'number' && Number.isInteger(n) ? { pullRequest: n } : {}),
    };
  }
  if (eventName === 'merge_group') {
    const base = p.merge_group?.base_sha;
    const head = p.merge_group?.head_sha;
    if (!isSha(base) || !isSha(head))
      return { error: 'The merge_group event has no base and head commit SHAs.' };
    return { base, head, mode: 'merge-base' };
  }
  if (eventName === 'push') {
    if (!isSha(p.after)) return { error: 'The push event has no "after" commit.' };
    if (!isSha(p.before))
      return { error: 'The push created a new branch, so there is no previous commit to compare.' };
    return { base: p.before, head: p.after, mode: 'direct' };
  }
  return {
    error: `The "${eventName || 'unknown'}" event does not say which commits to compare; set the base-sha and head-sha inputs to scan only changes.`,
  };
}

/** Reads `GITHUB_EVENT_PATH` and returns the commit range (or why there is none). */
export async function readEventRange(env: NodeJS.ProcessEnv): Promise<EventRange> {
  const path = env['GITHUB_EVENT_PATH'];
  const name = env['GITHUB_EVENT_NAME'] ?? '';
  if (!path) return { error: 'GITHUB_EVENT_PATH is not set (not running in GitHub Actions?).' };
  let payload: unknown;
  try {
    payload = JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    return { error: `Could not read the event payload: ${(err as Error).message}` };
  }
  return rangeFromEvent(name, payload);
}
