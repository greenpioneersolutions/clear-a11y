import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFinding, summarize, type Finding, type ScanResult } from '@clear-a11y/core';
import { rangeFromEvent } from './event.js';
import {
  parseBaseUrl,
  parseBoolean,
  parseFailOn,
  parseList,
  readInputs,
  type GetInput,
} from './inputs.js';
import { browserInstallHint, foldersFor, repoRelativeDir } from './main.js';
import {
  COMMENT_MARKER,
  failingCount,
  failureMessage,
  tierCounts,
  upsertPrComment,
} from './outputs.js';

const fixtureEvent = (name: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../fixtures/action', `${name}.json`), 'utf-8'),
  ) as unknown;

const inputsFrom =
  (values: Record<string, string>): GetInput =>
  (name) =>
    values[name] ?? '';

describe('inputs', () => {
  it('uses defaults when nothing is set', async () => {
    const inputs = await readInputs(inputsFrom({}), { cwd: '/work' });
    expect(inputs).toMatchObject({
      routes: {},
      defaultTargets: [],
      repoPath: '/work',
      config: {},
      changedOnly: true,
      failOn: 'violation',
      formats: ['sarif', 'html'],
      outDir: '/work/clear-a11y-report',
      maxPages: 25,
      comment: false,
      artifactName: 'clear-a11y-report',
    });
    expect(inputs.baseUrl).toBeUndefined();
    expect(inputs.githubToken).toBeUndefined();
  });

  it('parses every input', async () => {
    const files: Record<string, string> = {
      '/work/a11y/routes.json': '{"src/pages/checkout/**": ["/checkout"]}',
      '/work/clear-a11y.config.json': '{"viewports": [{"name":"m","width":375,"height":812}]}',
    };
    const inputs = await readInputs(
      inputsFrom({
        'base-url': 'http://localhost:3000',
        routes: 'a11y/routes.json',
        'default-targets': '/\n/about, /contact',
        'repo-path': 'web',
        config: 'clear-a11y.config.json',
        'storybook-static': 'web/storybook-static',
        'changed-only': 'false',
        'fail-on': 'likely',
        formats: 'json, sarif',
        'out-dir': '/tmp/out',
        'max-pages': '5',
        'base-sha': 'a'.repeat(40),
        'head-sha': 'b'.repeat(40),
        comment: 'true',
        'github-token': 'ghs_x',
        'artifact-name': 'a11y',
      }),
      { cwd: '/work', readText: async (p) => files[p] ?? Promise.reject(new Error('ENOENT')) },
    );
    expect(inputs).toMatchObject({
      baseUrl: 'http://localhost:3000/',
      routes: { 'src/pages/checkout/**': ['/checkout'] },
      defaultTargets: ['/', '/about', '/contact'],
      repoPath: '/work/web',
      configPath: '/work/clear-a11y.config.json',
      config: { viewports: [{ name: 'm', width: 375, height: 812 }] },
      storybookStatic: '/work/web/storybook-static',
      changedOnly: false,
      failOn: 'likely',
      formats: ['json', 'sarif'],
      outDir: '/tmp/out',
      maxPages: 5,
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      comment: true,
      githubToken: 'ghs_x',
      artifactName: 'a11y',
    });
  });

  it('accepts inline JSON routes', async () => {
    const inputs = await readInputs(inputsFrom({ routes: '{"src/**": "/"}' }), { cwd: '/w' });
    expect(inputs.routes).toEqual({ 'src/**': ['/'] });
  });

  it.each([
    [{ 'base-url': 'javascript:alert(1)' }, /base-url/],
    [{ 'base-url': 'not a url' }, /base-url/],
    [{ 'fail-on': 'error' }, /fail-on/],
    [{ formats: 'pdf' }, /Unknown report format/],
    [{ 'max-pages': '0' }, /max-pages/],
    [{ 'changed-only': 'maybe' }, /changed-only/],
    [{ 'base-sha': '--output=x' }, /base-sha/],
    [{ 'default-targets': 'https://evil.example/' }, /default-targets/],
    [{ routes: '{"src/**": ["https://evil.example/"]}' }, /Invalid route map/],
    [{ routes: '{not json' }, /not valid JSON/],
    [{ routes: 'missing.json' }, /Could not read the routes file/],
    [{ config: 'missing.json' }, /Could not read the config file/],
  ])('rejects %o', async (values, message) => {
    await expect(
      readInputs(inputsFrom(values), {
        cwd: '/w',
        readText: () => Promise.reject(new Error('ENOENT')),
      }),
    ).rejects.toThrow(message);
  });

  it('has small parsers with clear errors', () => {
    expect(parseList(' a,\n b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseBoolean('x', 'YES', false)).toBe(true);
    expect(parseBoolean('x', '', true)).toBe(true);
    expect(parseFailOn('')).toBe('violation');
    expect(parseFailOn('never')).toBe('never');
    expect(parseBaseUrl('')).toBeUndefined();
  });

  it('declares exactly the inputs it reads in action.yml', async () => {
    const yml = readFileSync(join(import.meta.dirname, '..', 'action.yml'), 'utf-8');
    const block = yml.slice(yml.indexOf('\ninputs:'), yml.indexOf('\noutputs:'));
    const declared = [...block.matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]).sort();
    const read = new Set<string>();
    await readInputs(
      (name) => {
        read.add(name);
        return '';
      },
      { cwd: '/w' },
    );
    expect(declared).toEqual([...read].sort());
    expect(yml).toMatch(/using: node24\n\s+main: dist\/index\.js/);
  });
});

describe('event', () => {
  it('reads base and head from a pull_request event', () => {
    expect(rangeFromEvent('pull_request', fixtureEvent('pull_request'))).toEqual({
      base: '1111111111111111111111111111111111111111',
      head: '2222222222222222222222222222222222222222',
      mode: 'merge-base',
      pullRequest: 42,
    });
  });

  it('reads before and after from a push event', () => {
    expect(rangeFromEvent('push', fixtureEvent('push'))).toEqual({
      base: '3333333333333333333333333333333333333333',
      head: '4444444444444444444444444444444444444444',
      mode: 'direct',
    });
  });

  it('explains missing SHAs and unsupported events', () => {
    expect(rangeFromEvent('pull_request', { pull_request: { base: {} } })).toEqual({
      error: expect.stringMatching(/no base and head/),
    });
    expect(rangeFromEvent('push', { before: '0'.repeat(40), after: 'a'.repeat(40) })).toEqual({
      error: expect.stringMatching(/new branch/),
    });
    expect(rangeFromEvent('pull_request', { pull_request: { base: { sha: '--x' } } })).toEqual({
      error: expect.any(String),
    });
    expect(rangeFromEvent('workflow_dispatch', {})).toEqual({
      error: expect.stringMatching(/base-sha and head-sha/),
    });
    expect(
      rangeFromEvent('merge_group', {
        merge_group: { base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40) },
      }),
    ).toMatchObject({ mode: 'merge-base' });
  });
});

describe('outputs', () => {
  const f = (tier: Finding['tier'], n: number): Finding =>
    createFinding({
      ruleId: `r/${tier}-${n}`,
      wcag: ['1.1.1'],
      tier,
      confidence: 0.9,
      engine: 'engine-static',
      page: { url: 'http://x/' },
      target: { selector: `#e${n}` },
      message: 'm',
      ...(tier === 'needs-review' ? { question: 'q?' } : {}),
      evidence: {},
    });
  const result = (findings: Finding[]): ScanResult => ({
    schemaVersion: 1,
    tool: { name: 'clear-a11y', version: '0' },
    startedAt: '',
    finishedAt: '',
    targets: [],
    pages: [],
    findings,
    errors: [],
    summary: summarize(findings),
  });

  it('counts tiers and applies fail-on', () => {
    const r = result([f('violation', 1), f('likely', 2), f('likely', 3), f('needs-review', 4)]);
    expect(tierCounts(r)).toEqual({ violation: 1, likely: 2, 'needs-review': 1 });
    expect(failingCount(r, 'violation')).toBe(1);
    expect(failingCount(r, 'likely')).toBe(3);
    expect(failingCount(r, 'needs-review')).toBe(4);
    expect(failingCount(r, 'never')).toBe(0);
    expect(failureMessage(r, 'violation')).toBe(
      'Clear A11Y found 1 violation. See the job summary and the report.',
    );
    expect(failureMessage(r, 'likely')).toBe(
      'Clear A11Y found 3 findings at or above "likely". See the job summary and the report.',
    );
    expect(failureMessage(result([f('likely', 1)]), 'violation')).toBeUndefined();
  });

  it('creates, then updates, one PR comment (fake fetch, no network)', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    let comments: unknown[] = [{ id: 7, body: `${COMMENT_MARKER}\nold`, user: { type: 'User' } }];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
      return new Response(init?.method ? '{}' : JSON.stringify(comments), { status: 200 });
    }) as typeof fetch;
    const opts = { token: 't', repository: 'o/r', pullRequest: 5, body: 'hello', fetch: fake };
    expect(await upsertPrComment(opts)).toBe('created');
    expect(calls[1]).toMatchObject({
      url: 'https://api.github.com/repos/o/r/issues/5/comments',
      method: 'POST',
    });
    expect(JSON.parse(calls[1]?.body ?? '{}').body).toBe(`${COMMENT_MARKER}\nhello`);
    comments = [{ id: 9, body: `${COMMENT_MARKER}\nold`, user: { type: 'Bot' } }];
    expect(await upsertPrComment(opts)).toBe('updated');
    expect(calls[3]).toMatchObject({
      url: 'https://api.github.com/repos/o/r/issues/comments/9',
      method: 'PATCH',
    });
    await expect(upsertPrComment({ ...opts, repository: 'o/r/../x' })).rejects.toThrow();
    const denied = (async () => new Response('', { status: 403 })) as typeof fetch;
    await expect(upsertPrComment({ ...opts, fetch: denied })).rejects.toThrow(/HTTP 403/);
  });
});

describe('main helpers', () => {
  it('lints the shallowest folders that hold the changed files', () => {
    expect(foldersFor(['src/a/x.tsx', 'src/a/b/y.tsx', 'src/c.tsx', 'lib/z.js'])).toEqual([
      'lib',
      'src',
    ]);
    expect(foldersFor(['a.tsx', 'src/b.tsx'])).toEqual(['.']);
  });

  it('gives the built Storybook as a repo-relative folder, or nothing outside the repo', () => {
    expect(repoRelativeDir('/work/web', '/work/web/storybook-static/')).toBe('storybook-static');
    expect(repoRelativeDir('/work/web', '/work/web/packages/ui/storybook-static')).toBe(
      'packages/ui/storybook-static',
    );
    expect(repoRelativeDir('/work/web', '/work/storybook-static')).toBeUndefined();
    expect(repoRelativeDir('/work/web', '/work/web')).toBeUndefined();
  });

  it('tells users how to install Chromium', () => {
    expect(browserInstallHint()).toMatch(/npx playwright(@[\d.]+)? install --with-deps chromium/);
  });
});
