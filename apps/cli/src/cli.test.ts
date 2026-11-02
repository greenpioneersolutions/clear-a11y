import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFinding, summarize, type ScanResult } from '@clear-a11y/core';
import { buildConfig, classifyTargets, parseList, parseTier, parseViewport } from './options.js';
import { createProgram, run, runtimeNote, shouldFail } from './program.js';

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      out: (t: string) => out.push(t),
      err: (t: string) => err.push(t),
      setExitCode: () => undefined,
    },
  };
};

describe('options', () => {
  it('parses viewports, tiers and lists', () => {
    expect(parseViewport('reflow')).toEqual({ name: 'reflow', width: 320, height: 256 });
    expect(parseViewport('1024x768')).toEqual({ name: '1024x768', width: 1024, height: 768 });
    expect(() => parseViewport('huge')).toThrow(/Unknown viewport/);
    expect(parseTier('likely')).toBe('likely');
    expect(() => parseTier('critical')).toThrow();
    expect(parseList('json, sarif,,html')).toEqual(['json', 'sarif', 'html']);
  });

  it('lets flags override the config file', async () => {
    const config = await buildConfig({
      out: 'r',
      format: ['json', 'html'],
      viewport: ['mobile'],
      crawl: true,
      maxPages: 5,
      screenshots: false,
      failOn: 'likely',
    });
    expect(config).toMatchObject({
      viewports: [{ name: 'mobile' }],
      crawl: { enabled: true, maxPages: 5 },
      output: { dir: 'r', formats: ['json', 'html'], screenshots: false },
      failOn: 'likely',
    });
  });
});

describe('program', () => {
  it('defines scan, report and bench commands', () => {
    expect(createProgram().commands.map((c) => c.name())).toEqual(['scan', 'report', 'bench']);
  });

  it('renders HTML and SARIF from an existing report.json', async () => {
    const finding = createFinding({
      ruleId: 'keyboard/focus-order-backward',
      wcag: ['2.4.3'],
      tier: 'likely',
      confidence: 0.8,
      engine: 'engine-keyboard',
      page: { url: 'http://127.0.0.1/form.html' },
      target: { selector: '#country' },
      message: 'Focus jumps back up the page.',
    });
    const result: ScanResult = {
      schemaVersion: 1,
      tool: { name: 'clear-a11y', version: '0.0.0' },
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      targets: ['http://127.0.0.1/form.html'],
      pages: [{ url: 'http://127.0.0.1/form.html', viewport: 'desktop', states: ['default'] }],
      findings: [finding],
      errors: [],
      summary: summarize([finding]),
    };
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-report-cmd-'));
    const out = join(dir, 'out');
    await writeFile(join(dir, 'report.json'), JSON.stringify(result));
    const h = io();
    expect(
      await run(['report', join(dir, 'report.json'), '--format', 'html,sarif', '--out', out], h.io),
    ).toBe(0);
    expect(h.out.join('')).toContain('Wrote html');
    const html = await readFile(join(out, 'report.html'), 'utf-8');
    expect(html).toContain('Focus order jumps backward');
    const sarif = JSON.parse(await readFile(join(out, 'report.sarif'), 'utf-8'));
    expect(sarif.runs[0].results[0]).toMatchObject({ ruleId: finding.ruleId, level: 'warning' });
  });

  it('rejects unknown report formats', async () => {
    const h = io();
    expect(await run(['report', 'x.json', '--format', 'pdf'], h.io)).toBeGreaterThan(0);
    expect(h.err.join('')).toContain('Unknown report format');
    expect(await run(['report', join(tmpdir(), 'missing-clear-a11y.json')], io().io)).toBe(2);
  });

  it('prints help and version with exit code 0', async () => {
    const h = io();
    expect(await run(['--help'], h.io)).toBe(0);
    expect(h.out.join('')).toContain('scan [options] <targets...>');
    expect(await run(['--version'], io().io)).toBe(0);
  });

  it('rejects bad arguments with exit code 1 or 2', async () => {
    const h = io();
    expect(await run(['scan', 'http://x', '--fail-on', 'nope'], h.io)).toBeGreaterThan(0);
    expect(h.err.join('')).toContain('--fail-on must be one of');
    expect(await run(['scan'], io().io)).toBeGreaterThan(0);
  });

  it('treats an existing directory as a repo and anything else as a URL or a usage error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-target-'));
    expect(await classifyTargets([dir])).toEqual({ kind: 'repo', path: dir });
    expect(await classifyTargets(['https://example.test/', 'http://localhost:3000/a'])).toEqual({
      kind: 'site',
      urls: ['https://example.test/', 'http://localhost:3000/a'],
    });
    await expect(classifyTargets([dir, 'https://example.test/'])).rejects.toThrow(/one repo/);
    await expect(classifyTargets(['localhost:3000'])).rejects.toThrow(
      /neither an existing directory/,
    );
    await expect(classifyTargets([join(dir, 'missing')])).rejects.toThrow(/neither/);
    const h = io();
    expect(await run(['scan', 'not-a-target'], h.io)).toBe(2);
    expect(h.err.join('')).toContain('neither an existing directory nor an http(s) URL');
  });

  it('passes --trust-repo-plugins into the repo config', async () => {
    const config = await buildConfig({
      out: 'r',
      format: ['json'],
      screenshots: true,
      trustRepoPlugins: true,
    });
    expect(config.repo).toEqual({ trustRepoPlugins: true });
  });

  it('passes the runtime flags into the repo config, on top of the config file', async () => {
    const config = await buildConfig({
      out: 'r',
      format: ['json'],
      screenshots: true,
      storybookUrl: 'http://localhost:6006/',
      storybookStatic: 'out/storybook',
      boot: true,
      maxStories: 5,
    });
    expect(config.repo).toEqual({
      storybookUrl: 'http://localhost:6006/',
      storybookStatic: 'out/storybook',
      boot: true,
      maxStories: 5,
    });
    expect((await buildConfig({ out: 'r', format: ['json'], screenshots: true })).repo).toBe(
      undefined,
    );
  });

  it('summarizes what the runtime layer covered', () => {
    expect(
      runtimeNote({
        mode: 'storybook',
        origin: 'repo:storybook-static/',
        stories: 8,
        pages: 8,
        findings: 3,
        notes: [],
      }),
    ).toBe(
      'Repo scan: source lint plus 8 Storybook stories from repo:storybook-static/, scanned with every enabled engine.',
    );
    expect(
      runtimeNote({
        mode: 'dev-server',
        origin: 'http://127.0.0.1:5173/',
        pages: 3,
        findings: 0,
        notes: [],
      }),
    ).toMatch(/3 page\(s\) of the dev server at http:\/\/127.0.0.1:5173\/ \(stopped/);
    expect(
      runtimeNote({ mode: 'none', reason: 'Use --boot.', pages: 0, findings: 0, notes: [] }),
    ).toBe('Use --boot.');
  });

  it('fails CI only at or above the threshold', () => {
    const f = createFinding({
      ruleId: 'a/b',
      wcag: ['1.1.1'],
      tier: 'likely',
      confidence: 0.7,
      engine: 'engine-x',
      page: { url: 'u' },
      target: { selector: 'img' },
      message: 'm',
    });
    expect(shouldFail([f], 'violation')).toBe(false);
    expect(shouldFail([f], 'likely')).toBe(true);
    expect(shouldFail([], 'needs-review')).toBe(false);
  });
});
