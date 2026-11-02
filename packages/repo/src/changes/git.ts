import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** A commit SHA or a plain ref name; never something git could read as an option. */
const REF = /^(?!-)[\w][\w./@^~-]{0,254}$/;

export interface ChangedFilesOptions {
  /** Repository checkout. */
  repoPath: string;
  /** Base commit (for a pull request: `pull_request.base.sha`). */
  base: string;
  /** Head commit (for a pull request: `pull_request.head.sha`). */
  head: string;
  /**
   * `merge-base` (default) compares `base...head`, i.e. only what the head side changed since the
   * branches split, like a pull request's "Files changed" tab. `direct` compares `base..head`
   * (used for push events, where `before` is an ancestor of `after`).
   */
  mode?: 'merge-base' | 'direct';
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', resolve(repoPath), ...args], {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
  return stdout;
}

/**
 * Files a change touched, from the local git history: `git diff --name-only base...head`.
 * Deleted files are left out (there is nothing left to scan). Paths are POSIX and relative to
 * `repoPath`; when it is a folder inside the git repo, changes outside it are left out.
 * Needs both commits locally; in GitHub Actions check out with `fetch-depth: 0`. No network and
 * no GitHub API calls. Throws an explanatory error when history is missing.
 */
export async function changedFilesFromGit(options: ChangedFilesOptions): Promise<string[]> {
  for (const [name, ref] of [
    ['base', options.base],
    ['head', options.head],
  ] as const)
    if (!REF.test(ref)) throw new Error(`Invalid ${name} commit "${ref}".`);
  const range =
    options.mode === 'direct'
      ? `${options.base}..${options.head}`
      : `${options.base}...${options.head}`;
  try {
    const out = await git(options.repoPath, [
      '-c',
      'core.quotePath=false',
      'diff',
      '--name-only',
      '-z',
      '--diff-filter=d',
      // Paths relative to repoPath, which may be a folder inside the git repo (a monorepo app).
      '--relative',
      range,
      '--',
    ]);
    return out
      .split('\0')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    const detail = ((err as { stderr?: string }).stderr || (err as Error).message).trim();
    const shallow = await git(options.repoPath, ['rev-parse', '--is-shallow-repository'])
      .then((s) => s.trim() === 'true')
      .catch(() => false);
    throw new Error(
      `Could not list the files changed between ${options.base} and ${options.head}: ${detail}` +
        (shallow
          ? '\nThe checkout is shallow, so the base commit or the merge base is missing. Use actions/checkout with `fetch-depth: 0`.'
          : '\nMake sure both commits are in the local history (actions/checkout with `fetch-depth: 0`).'),
    );
  }
}
