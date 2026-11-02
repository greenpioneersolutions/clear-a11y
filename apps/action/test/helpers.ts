import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf-8' }).trim();

export type Files = Record<string, string | null>;

async function apply(root: string, files: Files) {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) git(root, 'rm', '-q', file);
    else {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), content);
    }
  }
}

/**
 * A throwaway git repo with two commits on a feature branch: `base` (main) and `head`. Returns
 * both SHAs, like a pull_request event would carry them.
 */
export async function makeRepo(
  base: Files,
  head: Files,
): Promise<{ root: string; base: string; head: string }> {
  const root = await mkdtemp(join(tmpdir(), 'clear-a11y-action-'));
  git(root, 'init', '-q', '-b', 'main');
  await apply(root, base);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'feature');
  await apply(root, head);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'head');
  return { root, base: baseSha, head: git(root, 'rev-parse', 'HEAD') };
}

/** Writes a pull_request event payload like GitHub's (see fixtures/action/pull_request.json). */
export async function writePullRequestEvent(dir: string, base: string, head: string) {
  const template = JSON.parse(
    await readFile(
      join(import.meta.dirname, '..', '..', '..', 'fixtures', 'action', 'pull_request.json'),
      'utf-8',
    ),
  ) as { pull_request: { base: { sha: string }; head: { sha: string } } };
  template.pull_request.base.sha = base;
  template.pull_request.head.sha = head;
  const path = join(dir, 'event.json');
  await writeFile(path, JSON.stringify(template));
  return path;
}

/** Parses a GITHUB_OUTPUT file (`name<<DELIMITER\nvalue\nDELIMITER`). */
export function parseOutputFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^([^<=]+)<<(.+)$/.exec(lines[i] ?? '');
    if (!m) continue;
    const [, name, delim] = m;
    const value: string[] = [];
    while (++i < lines.length && lines[i] !== delim) value.push(lines[i] ?? '');
    out[name as string] = value.join('\n');
  }
  return out;
}

/** INPUT_* variables the way the runner sets them from `with:`. */
export const inputEnv = (inputs: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(inputs).map(([k, v]) => [`INPUT_${k.replace(/ /g, '_').toUpperCase()}`, v]),
  );
