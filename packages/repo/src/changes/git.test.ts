import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { changedFilesFromGit } from './git.js';

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf-8' }).trim();

async function write(root: string, file: string, content: string) {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), content);
}

describe('changedFilesFromGit', () => {
  let repo: string;
  let base: string;
  let head: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'clear-a11y-git-'));
    git(repo, 'init', '-q', '-b', 'main');
    await write(repo, 'src/components/Button.tsx', 'export const B = 1;\n');
    await write(repo, 'src/old.tsx', 'x\n');
    await write(repo, 'README.md', '# r\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'base');
    base = git(repo, 'rev-parse', 'HEAD');
    git(repo, 'checkout', '-q', '-b', 'feature');
    await write(repo, 'src/components/Button.tsx', 'export const B = 2;\n');
    await write(repo, 'src/pages/checkout/Form tab.tsx', 'y\n');
    git(repo, 'rm', '-q', 'src/old.tsx');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'change');
    head = git(repo, 'rev-parse', 'HEAD');
    // main moves on after the branch point; merge-base mode must not report this file
    git(repo, 'checkout', '-q', 'main');
    await write(repo, 'README.md', '# changed on main\n');
    git(repo, 'commit', '-q', '-am', 'main moves');
  });
  afterAll(() => rm(repo, { recursive: true, force: true }));

  it('lists added and modified files since the merge base, without deletions', async () => {
    const mainHead = git(repo, 'rev-parse', 'main');
    expect(await changedFilesFromGit({ repoPath: repo, base: mainHead, head })).toEqual([
      'src/components/Button.tsx',
      'src/pages/checkout/Form tab.tsx',
    ]);
    expect(await changedFilesFromGit({ repoPath: repo, base, head, mode: 'direct' })).toEqual([
      'src/components/Button.tsx',
      'src/pages/checkout/Form tab.tsx',
    ]);
  });

  it('is relative to a repo path inside the git repo (monorepo app)', async () => {
    expect(await changedFilesFromGit({ repoPath: join(repo, 'src'), base, head })).toEqual([
      'components/Button.tsx',
      'pages/checkout/Form tab.tsx',
    ]);
  });

  it('rejects refs that could be read as options', async () => {
    await expect(
      changedFilesFromGit({ repoPath: repo, base: '--output=/tmp/x', head }),
    ).rejects.toThrow(/Invalid base commit/);
  });

  it('explains missing history', async () => {
    await expect(
      changedFilesFromGit({ repoPath: repo, base: 'f'.repeat(40), head }),
    ).rejects.toThrow(/fetch-depth: 0/);
  });
});
