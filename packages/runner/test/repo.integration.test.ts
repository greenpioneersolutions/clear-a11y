import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScanResultSchema, type Finding } from '@clear-a11y/core';
import { storyIdFromUrl, type SpawnFn } from '@clear-a11y/repo';
import { fixturesReposDir } from '@clear-a11y/test-utils';
import {
  RepoExpectedSchema,
  repoFindingMatchesIssue,
  scanRepo,
  type FullRepoScanResult,
} from '../src/index.js';

const repoDir = (name: string) => join(fixturesReposDir(), name);
const config = { output: { screenshots: false } };

/** True while any process of the group led by `pid` is alive. */
const groupAlive = (pid: number) => {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('scanRepo with a built Storybook (integration)', () => {
  let scanned: FullRepoScanResult;
  // Full engine set, every story: the same run the benchmark scores.
  beforeAll(async () => {
    scanned = await scanRepo({ path: repoDir('storybook-sample'), config });
  }, 240_000);

  it('scans every story (not docs) as its own page and merges static + runtime results', () => {
    const { result, runtime } = scanned;
    expect(() => ScanResultSchema.parse(result)).not.toThrow();
    expect(runtime).toMatchObject({
      mode: 'storybook',
      origin: 'repo:storybook-static/',
      stories: 8,
      pages: 8,
    });
    expect(result.targets).toEqual([
      `repo:${repoDir('storybook-sample')}`,
      'repo:storybook-static/',
    ]);
    const storyPages = result.pages.filter((p) => storyIdFromUrl(p.url));
    expect(storyPages.map((p) => storyIdFromUrl(p.url))).not.toContain('components-button--docs');
    expect(storyPages[0]?.url).toBe(
      'repo:storybook-static/iframe.html?id=components-button--primary&viewMode=story',
    );
    // Static lint still ran on the component files.
    expect(result.pages.some((p) => p.url === 'repo:src/components/Tabs.tsx')).toBe(true);
    expect(result.errors).toEqual([]);
    expect(scanned.notices).toEqual([]);
  });

  it('finds every seeded barrier, nothing on correct stories, and no unexpected violation', async () => {
    const expected = RepoExpectedSchema.parse(
      JSON.parse(await readFile(join(repoDir('storybook-sample'), 'expected.json'), 'utf-8')),
    );
    const { findings } = scanned.result;
    for (const issue of expected.issues)
      expect(
        findings.some((f) => repoFindingMatchesIssue(f, issue)),
        `${issue.id} not found`,
      ).toBe(true);
    const onCorrect = findings.filter((f) =>
      expected.correctStories.includes(storyIdFromUrl(f.page.url) ?? ''),
    );
    expect(onCorrect.map((f) => `${f.ruleId} ${f.page.url}`)).toEqual([]);
    for (const f of findings.filter((x) => x.tier === 'violation'))
      expect(
        expected.issues.some((i) => repoFindingMatchesIssue(f, i)),
        `${f.ruleId} ${f.page.url}`,
      ).toBe(true);
    // Ids are stable: they don't contain the random port of the local static server.
    expect(findings.every((f) => !f.page.url.startsWith('http'))).toBe(true);
  });

  it('maps runtime findings to source: attribute, literal search, then the story file', () => {
    const on = (story: string, rule: string): Finding | undefined =>
      scanned.result.findings.find(
        (f) => storyIdFromUrl(f.page.url) === story && f.ruleId === rule,
      );
    // data-testid="icon-button" appears once in the source: literal search.
    expect(on('components-button--icon-only', 'static/button-name')?.source).toEqual({
      file: 'src/components/IconButton.tsx',
      line: 14,
    });
    // data-clear-a11y-src on an ancestor of the dialog, read from the live page.
    const modal = on('components-modal--no-focus-management', 'keyboard/overlay-focus-not-moved');
    expect(modal?.source).toEqual({ file: 'src/components/Modal.tsx', line: 11 });
    expect(modal?.evidence.data?.['sourceMatch']).toMatchObject({ strategy: 'attribute' });
    // No reliable clue: the story's own export in its CSF file.
    const card = on('components-card--low-contrast', 'static/color-contrast');
    expect(card?.source).toEqual({
      file: 'src/components/Card.stories.tsx',
      line: 12,
      component: 'Components/Card',
    });
    expect(card?.evidence.data?.['sourceMatch']).toMatchObject({ strategy: 'story-file' });
  });

  it('caps and filters stories, with a notice', async () => {
    const { runtime, notices, result } = await scanRepo({
      path: repoDir('storybook-sample'),
      config,
      only: ['static'],
      repo: { maxStories: 2, storyFilter: ['components-card--*', 'components-button--*'] },
    });
    expect(runtime.stories).toBe(2);
    expect(notices).toEqual([expect.stringMatching(/first 2 of 4 stories \(repo.maxStories\)/)]);
    expect(result.pages.map((p) => storyIdFromUrl(p.url)).filter(Boolean)).toEqual([
      'components-button--primary',
      'components-button--icon-only',
    ]);
  }, 120_000);
});

describe('scanRepo --boot (integration)', () => {
  it('never starts a dev server without the opt-in', async () => {
    let spawned = 0;
    const spawn = (() => {
      spawned++;
      throw new Error('must not spawn');
    }) as unknown as SpawnFn;
    const { runtime, result } = await scanRepo({
      path: repoDir('static-app-sample'),
      config,
      devServer: { spawn },
    });
    expect(spawned).toBe(0);
    expect(runtime.mode).toBe('none');
    expect(runtime.reason).toMatch(/--boot/);
    expect(result.targets).toEqual([`repo:${repoDir('static-app-sample')}`]);
  });

  it('boots the app, crawls it like a site, and kills the process tree afterwards', async () => {
    let pid = 0;
    const { runtime, result } = await scanRepo({
      path: repoDir('static-app-sample'),
      config,
      only: ['static'],
      repo: { boot: true },
      devServer: { onSpawn: (p) => (pid = p) },
    });
    expect(pid).toBeGreaterThan(0);
    expect(groupAlive(pid)).toBe(false);
    expect(runtime).toMatchObject({ mode: 'dev-server', pages: 3 });
    const origin = runtime.origin as string;
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(result.targets).toEqual([`repo:${repoDir('static-app-sample')}`, origin]);
    const hit = (path: string, rule: string, selector: string) =>
      result.findings.some(
        (f) =>
          f.page.url === new URL(path, origin).href &&
          f.ruleId === rule &&
          f.target.selector === selector,
      );
    expect(hit('/', 'static/link-name', '#cart-link')).toBe(true);
    expect(hit('/form', 'static/label', '#contact-email')).toBe(true);
  }, 120_000);

  it('keeps the static results and kills the server when booting fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'clear-a11y-boot-'));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ private: true, scripts: { dev: 'node -e "setInterval(() => {}, 1000)"' } }),
    );
    let pid = 0;
    try {
      const { runtime, result, notices } = await scanRepo({
        path: root,
        config,
        repo: { boot: true, bootTimeoutMs: 1_000 },
        devServer: { onSpawn: (p) => (pid = p) },
      });
      expect(groupAlive(pid)).toBe(false);
      expect(runtime.mode).toBe('dev-server');
      expect(notices.join('\n')).toMatch(/--boot: the dev server did not answer within 1s/);
      expect(result.errors.some((e) => e.engine === 'repo-runtime')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});
