import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturesReposDir, startFixtureServer } from '@clear-a11y/test-utils';
import { run } from '../src/index.js';

describe('clear-a11y scan (integration)', () => {
  it('scans a fixture, writes report.json and fails on violations', async () => {
    const server = await startFixtureServer();
    const out = await mkdtemp(join(tmpdir(), 'clear-a11y-cli-'));
    const stdout: string[] = [];
    try {
      const code = await run(
        ['scan', server.url('static/img-missing-alt.html'), '--out', out, '--engines', 'static'],
        {
          out: (t) => stdout.push(t),
          err: () => undefined,
          setExitCode: () => undefined,
        },
      );
      expect(code).toBe(1);
      expect(stdout.join('')).toContain('static/image-alt');
      const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf-8'));
      expect(report.findings.some((f: { ruleId: string }) => f.ruleId === 'static/image-alt')).toBe(
        true,
      );
      expect(
        report.findings.find((f: { ruleId: string }) => f.ruleId === 'static/image-alt').evidence
          .screenshot,
      ).toMatch(/^artifacts\//);
    } finally {
      await server.close();
    }
  });

  it('scans a source repo directory: findings with file and line, SARIF physical locations', async () => {
    const out = await mkdtemp(join(tmpdir(), 'clear-a11y-cli-repo-'));
    const repo = join(fixturesReposDir(), 'react-sample');
    const stdout: string[] = [];
    const h = {
      out: (t: string) => stdout.push(t),
      err: () => undefined,
      setExitCode: () => undefined,
    };
    const code = await run(
      ['scan', repo, '--format', 'json,sarif', '--out', out, '--fail-on', 'likely'],
      h,
    );
    expect(code).toBe(1);
    expect(stdout.join('')).toContain('repo/jsx-a11y/alt-text');
    expect(stdout.join('')).toContain('Note: Runtime checks skipped: pass --boot');
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf-8'));
    expect(report.targets).toEqual([`repo:${repo}`]);
    const alt = report.findings.find(
      (f: { ruleId: string; source?: { file: string } }) =>
        f.ruleId === 'repo/jsx-a11y/alt-text' &&
        f.source?.file === 'src/components/ProductCard.tsx',
    );
    expect(alt).toMatchObject({ tier: 'violation', source: { line: 14 } });
    const sarif = JSON.parse(await readFile(join(out, 'report.sarif'), 'utf-8'));
    const locations = sarif.runs[0].results.map(
      (r: { locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }> }) =>
        r.locations[0]?.physicalLocation.artifactLocation.uri,
    );
    expect(locations).toContain('src/components/ProductCard.tsx');
  });

  it('scans the stories of a built Storybook with --max-stories', async () => {
    const out = await mkdtemp(join(tmpdir(), 'clear-a11y-cli-sb-'));
    const repo = join(fixturesReposDir(), 'storybook-sample');
    const stdout: string[] = [];
    const code = await run(
      ['scan', repo, '--out', out, '--engines', 'static', '--max-stories', '2', '--no-screenshots'],
      { out: (t) => stdout.push(t), err: () => undefined, setExitCode: () => undefined },
    );
    // The icon-only story has a real violation (button without a name): default --fail-on fails.
    expect(code).toBe(1);
    expect(stdout.join('')).toContain(
      'Note: Repo scan: source lint plus 2 Storybook stories from repo:storybook-static/',
    );
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf-8'));
    expect(report.targets).toEqual([`repo:${repo}`, 'repo:storybook-static/']);
    expect(
      report.findings.find((f: { ruleId: string }) => f.ruleId === 'static/button-name'),
    ).toMatchObject({
      page: {
        url: 'repo:storybook-static/iframe.html?id=components-button--icon-only&viewMode=story',
      },
      source: { file: 'src/components/IconButton.tsx' },
    });
  }, 120_000);

  it('exits 0 on a correct-pattern page', async () => {
    const server = await startFixtureServer();
    try {
      const out = await mkdtemp(join(tmpdir(), 'clear-a11y-cli-'));
      expect(
        await run(['scan', server.url('static/ok.html'), '--out', out, '--no-screenshots'], {
          out: () => undefined,
          err: () => undefined,
          setExitCode: () => undefined,
        }),
      ).toBe(0);
    } finally {
      await server.close();
    }
  });
});
