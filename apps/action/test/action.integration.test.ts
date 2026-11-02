import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { startFixtureServer, type StaticServer } from '@clear-a11y/test-utils';
import { run } from '../src/main.js';
import { inputEnv, makeRepo, parseOutputFile, writePullRequestEvent } from './helpers.js';

const exec = promisify(execFile);
const BUNDLE = join(import.meta.dirname, '..', 'dist', 'index.js');

const BUTTON_OK = `export function Button({ label }: { label: string }) {
  return <button type="button">{label}</button>;
}
`;
// The pull request adds a literal <img> with no alt at all: a repo `violation`.
const BUTTON_CHANGED = `export function Button({ label }: { label: string }) {
  return (
    <button type="button">
      <img src="/icons/cart.svg" />
      {label}
    </button>
  );
}
`;
const STORY_IFRAME = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Components / Button: Icon only</title></head>
  <body>
    <main>
      <h1>Button</h1>
      <button id="icon-button" type="button"><svg aria-hidden="true" width="16" height="16"></svg></button>
    </main>
  </body>
</html>
`;
const STORY_INDEX = JSON.stringify({
  v: 5,
  entries: {
    'components-button--icon-only': {
      type: 'story',
      id: 'components-button--icon-only',
      title: 'Components/Button',
      name: 'Icon only',
      importPath: './src/components/Button.stories.tsx',
    },
    'components-card--default': {
      type: 'story',
      id: 'components-card--default',
      title: 'Components/Card',
      name: 'Default',
      importPath: './src/components/Card.stories.tsx',
    },
  },
});

const ROUTES = JSON.stringify({
  'src/pages/checkout/**': ['/static/form-missing-label.html'],
  'src/pages/about/**': ['/static/ok.html'],
  'src/components/Button.tsx': ['/static/img-missing-alt.html'],
});

const BASE_FILES = {
  'package.json': JSON.stringify({ name: 'shop', private: true, dependencies: { react: '^19' } }),
  'src/components/Button.tsx': BUTTON_OK,
  'src/components/Card.tsx': 'export const Card = () => <div>card</div>;\n',
  'src/components/Button.stories.tsx':
    "import { Button } from './Button';\n\nexport default { component: Button };\n\nexport const IconOnly = { args: { label: '' } };\n",
  'src/pages/about/About.tsx': 'export const About = () => <h1>About</h1>;\n',
  'storybook-static/index.json': STORY_INDEX,
  'storybook-static/iframe.html': STORY_IFRAME,
  'docs/notes.md': '# Notes\n',
};

describe('GitHub Action (simulated pull_request)', () => {
  let server: StaticServer;
  let work: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    server = await startFixtureServer();
    work = await mkdtemp(join(tmpdir(), 'clear-a11y-action-run-'));
  });
  afterAll(async () => {
    await server.close();
    await rm(work, { recursive: true, force: true });
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  /** GitHub's environment for one run: event, workspace, summary/output files and inputs. */
  async function actionEnv(
    name: string,
    repo: { root: string; base: string; head: string },
    inputs: Record<string, string>,
  ) {
    const dir = await mkdtemp(join(work, `${name}-`));
    const summary = join(dir, 'summary.md');
    const output = join(dir, 'output.txt');
    await writeFile(summary, '');
    await writeFile(output, '');
    const env: Record<string, string> = {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: await writePullRequestEvent(dir, repo.base, repo.head),
      GITHUB_WORKSPACE: repo.root,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: 'example/shop',
      ...inputEnv({ 'out-dir': join(dir, 'report'), ...inputs }),
    };
    return { env, summary, output, outDir: join(dir, 'report') };
  }

  it('scans only the routes, stories and files the pull request touched', async () => {
    const repo = await makeRepo(BASE_FILES, {
      'src/components/Button.tsx': BUTTON_CHANGED,
      'src/pages/checkout/Form.tsx': 'export const Form = () => <form>checkout</form>;\n',
      'docs/notes.md': '# Notes\n\nChanged.\n',
    });
    const { env, summary, output, outDir } = await actionEnv('pr', repo, {
      'base-url': server.url('/'),
      routes: ROUTES,
      'storybook-static': 'storybook-static',
      'fail-on': 'violation',
      formats: 'sarif,html,json',
    });
    Object.assign(process.env, env);

    const res = await run({ env: process.env });

    // Only mapped targets: the checkout route, the Button route and the Button story.
    expect(res.changedFiles).toEqual([
      'docs/notes.md',
      'src/components/Button.tsx',
      'src/pages/checkout/Form.tsx',
    ]);
    expect(res.scannedUrls).toEqual([
      server.url('/static/form-missing-label.html'),
      server.url('/static/img-missing-alt.html'),
      expect.stringMatching(/\/iframe\.html\?id=components-button--icon-only&viewMode=story$/),
    ]);
    expect(res.scannedUrls.join(' ')).not.toMatch(/ok\.html|components-card/);
    expect(res.targets.sourceFiles).toEqual([
      'src/components/Button.tsx',
      'src/pages/checkout/Form.tsx',
    ]);

    // Findings from all three layers: pages, the story and the changed source file.
    const urls = new Set(res.result.findings.map((f) => f.page.url));
    expect(urls).toContain(server.url('/static/img-missing-alt.html'));
    expect([...urls].some((u) => u.includes('components-button--icon-only'))).toBe(true);
    // Stories go through the runner's Storybook layer: findings point at the story source.
    const story = res.result.findings.filter((f) => f.page.url.includes('icon-only'));
    expect(story.length).toBeGreaterThan(0);
    expect(story.every((f) => f.page.url.startsWith('repo:storybook-static/'))).toBe(true);
    expect(story.some((f) => f.source?.file === 'src/components/Button.stories.tsx')).toBe(true);
    const lint = res.result.findings.filter((f) => f.engine === 'repo-eslint');
    expect(lint.length).toBeGreaterThan(0);
    expect(lint.every((f) => f.source?.file === 'src/components/Button.tsx')).toBe(true);
    expect(lint.some((f) => f.tier === 'violation' && f.wcag.includes('1.1.1'))).toBe(true);

    // fail-on: violation
    expect(res.exitCode).toBe(1);
    expect(res.failure).toMatch(/Clear A11Y found \d+ violations?/);

    // SARIF for upload-sarif, with the source finding at its repo-relative file and line.
    const sarif = JSON.parse(await readFile(join(outDir, 'report.sarif'), 'utf-8'));
    expect(sarif.version).toBe('2.1.0');
    const results = sarif.runs[0].results as Array<{
      level: string;
      locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
    }>;
    expect(results.length).toBe(res.result.findings.length);
    expect(
      results.some(
        (r) =>
          r.level === 'error' &&
          r.locations[0]?.physicalLocation.artifactLocation.uri === 'src/components/Button.tsx',
      ),
    ).toBe(true);
    // The story finding reaches code scanning at the story's source file.
    expect(
      results.some(
        (r) =>
          r.locations[0]?.physicalLocation.artifactLocation.uri ===
          'src/components/Button.stories.tsx',
      ),
    ).toBe(true);
    expect(existsSync(join(outDir, 'report.html'))).toBe(true);

    // Job summary.
    const md = await readFile(summary, 'utf-8');
    expect(md).toContain('## Clear A11Y accessibility scan');
    expect(md).toMatch(/\| Violation \| [1-9]\d* \|/);
    expect(md).toContain('3 changed files between');
    expect(md).toContain('Linted 2 changed source files');
    expect(md).toContain('`src/components/Button.tsx:');
    expect(md).toContain('artifact of this run');

    // Outputs.
    const outputs = parseOutputFile(await readFile(output, 'utf-8'));
    const counts = {
      violation: res.result.findings.filter((f) => f.tier === 'violation').length,
      likely: res.result.findings.filter((f) => f.tier === 'likely').length,
      review: res.result.findings.filter((f) => f.tier === 'needs-review').length,
    };
    expect(outputs).toMatchObject({
      violations: String(counts.violation),
      likely: String(counts.likely),
      'needs-review': String(counts.review),
      'sarif-path': join(outDir, 'report.sarif'),
      'report-path': join(outDir, 'report.html'),
      'json-path': join(outDir, 'report.json'),
      'changed-files': '3',
    });
    expect(JSON.parse(outputs['scanned-targets'] ?? '[]')).toEqual(res.scannedUrls);
  });

  it('scans nothing and passes when no changed file maps to a target', async () => {
    const repo = await makeRepo(BASE_FILES, { 'docs/notes.md': '# Notes\n\nTypo.\n' });
    const { env, summary, output } = await actionEnv('docs', repo, {
      'base-url': server.url('/'),
      routes: ROUTES,
    });
    Object.assign(process.env, env);

    const res = await run({ env: process.env });

    expect(res.exitCode).toBe(0);
    expect(res.scannedUrls).toEqual([]);
    expect(res.result.findings).toEqual([]);
    const md = await readFile(summary, 'utf-8');
    expect(md).toContain('No findings');
    expect(md).toContain('no default targets are configured, so no pages were scanned');
    expect(parseOutputFile(await readFile(output, 'utf-8'))).toMatchObject({
      violations: '0',
      'scanned-targets': '[]',
    });
  });

  it('the bundled dist/index.js runs end to end without node_modules', async () => {
    expect(existsSync(BUNDLE), 'run `nx build action` first').toBe(true);
    // A harmless change to Button.tsx: its route (img-missing-alt) has an axe violation.
    const repo = await makeRepo(BASE_FILES, {
      'src/components/Button.tsx': `// Shared button.\n${BUTTON_OK}`,
    });
    const { env, summary, output, outDir } = await actionEnv('bundle', repo, {
      'base-url': server.url('/'),
      routes: ROUTES,
      'fail-on': 'violation',
    });
    // Run a copy outside the workspace, the way GitHub runs it: action.yml, package.json and
    // dist/, with no node_modules to fall back on.
    const actionDir = await mkdtemp(join(tmpdir(), 'clear-a11y-action-dist-'));
    await cp(join(import.meta.dirname, '..', 'dist'), join(actionDir, 'dist'), { recursive: true });
    await cp(join(import.meta.dirname, '..', 'package.json'), join(actionDir, 'package.json'));
    const { PATH, HOME, TMPDIR, PLAYWRIGHT_BROWSERS_PATH } = process.env;
    const child = await exec(process.execPath, [join(actionDir, 'dist', 'index.js')], {
      cwd: repo.root,
      env: {
        ...(PATH ? { PATH } : {}),
        ...(HOME ? { HOME } : {}),
        ...(TMPDIR ? { TMPDIR } : {}),
        ...(PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH } : {}),
        ...env,
      },
    }).then(
      (r) => ({ code: 0, ...r }),
      (err: { code: number; stdout: string; stderr: string }) => err,
    );

    // The page's image has no alt: a violation, so the job fails with exit code 1.
    const md = await readFile(summary, 'utf-8');
    expect(`${child.stdout}\n${child.stderr}\n${md}`).toContain('::error::Clear A11Y found');
    expect(child.code).toBe(1);
    const outputs = parseOutputFile(await readFile(output, 'utf-8'));
    expect(Number(outputs['violations'])).toBeGreaterThan(0);
    expect(JSON.parse(outputs['scanned-targets'] ?? '[]')).toEqual([
      server.url('/static/img-missing-alt.html'),
    ]);
    expect(existsSync(join(outDir, 'report.sarif'))).toBe(true);
    expect(md).toContain('## Clear A11Y accessibility scan');
    await rm(actionDir, { recursive: true, force: true });
  });
});
