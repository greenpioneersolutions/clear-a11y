import { createFinding, summarize, type Finding, type ScanResult } from '@clear-a11y/core';
import { limitResultToFiles, mergeScanResults } from './results.js';
import {
  isRoutePath,
  nextRouteForFile,
  parseRouteMap,
  resolveRoute,
  routesForFile,
} from './routes.js';
import { matchStory, parseStoryIndex, storyIframePath, type StoryEntry } from './storybook.js';
import { allTargets, targetsForChanges } from './targets.js';

const INDEX = {
  v: 5,
  entries: {
    'components-button--primary': {
      type: 'story',
      id: 'components-button--primary',
      title: 'Components/Button',
      name: 'Primary',
      importPath: './src/components/Button.stories.tsx',
    },
    'components-button--docs': {
      type: 'docs',
      id: 'components-button--docs',
      title: 'Components/Button',
      name: 'Docs',
      importPath: './src/components/Button.stories.tsx',
    },
    'components-card--default': {
      type: 'story',
      id: 'components-card--default',
      title: 'Components/Card',
      name: 'Default',
      importPath: './src/stories/Card.stories.tsx',
      componentPath: './src/components/Card.tsx',
    },
    'forms-input--default': {
      type: 'story',
      id: 'forms-input--default',
      title: 'Forms/Input',
      name: 'Default',
      importPath: './src/forms/Input/Input.stories.tsx',
    },
    broken: { type: 'story', id: 7 },
  },
};

describe('route map', () => {
  it('accepts lists and single routes, and rejects other origins', () => {
    expect(parseRouteMap({ 'src/a/**': ['/a', '/b'], 'src/c.tsx': '/c' })).toEqual({
      'src/a/**': ['/a', '/b'],
      'src/c.tsx': ['/c'],
    });
    expect(() => parseRouteMap({ 'src/**': ['https://evil.example/'] })).toThrow(
      /starts with "\/"/,
    );
    expect(() => parseRouteMap({ 'src/**': ['//evil.example/x'] })).toThrow(/Invalid route map/);
    expect(() => parseRouteMap(['/a'])).toThrow(/Invalid route map/);
    expect(isRoutePath('/a b')).toBe(false);
  });

  it('matches globs against repo-relative files', () => {
    const map = { 'src/pages/checkout/**': ['/checkout'], './src/components/*.tsx': ['/'] };
    expect(routesForFile('src/pages/checkout/Step.tsx', map)).toEqual(['/checkout']);
    expect(routesForFile('src/pages/checkout/deep/Step.tsx', map)).toEqual(['/checkout']);
    expect(routesForFile('src/components/Header.tsx', map)).toEqual(['/']);
    expect(routesForFile('src/components/deep/Header.tsx', map)).toEqual([]);
  });

  it('resolves routes against the base URL, keeping its path and origin', () => {
    expect(resolveRoute('http://127.0.0.1:3000', '/checkout')).toBe(
      'http://127.0.0.1:3000/checkout',
    );
    expect(resolveRoute('https://preview.example.dev/app/', '/checkout?step=2')).toBe(
      'https://preview.example.dev/app/checkout?step=2',
    );
    expect(() => resolveRoute('ftp://x.example', '/a')).toThrow(/http/);
    expect(() => resolveRoute('https://x.example', 'https://evil.example')).toThrow();
  });
});

describe('Next.js conventions', () => {
  it.each([
    ['app/page.tsx', '/'],
    ['src/app/checkout/page.tsx', '/checkout'],
    ['apps/web/app/(shop)/cart/page.jsx', '/cart'],
    ['app/settings/layout.tsx', '/settings'],
    ['pages/index.tsx', '/'],
    ['src/pages/about.tsx', '/about'],
    ['pages/blog/index.js', '/blog'],
  ])('%s -> %s', (file, route) => {
    expect(nextRouteForFile(file)).toEqual({ route });
  });

  it('skips what has no static URL', () => {
    expect(nextRouteForFile('app/product/[id]/page.tsx')?.skipped).toMatch(/dynamic/);
    expect(nextRouteForFile('pages/api/hello.ts')?.skipped).toMatch(/API/);
    expect(nextRouteForFile('pages/_app.tsx')?.skipped).toMatch(/not a page/);
    expect(nextRouteForFile('app/@modal/page.tsx')?.skipped).toMatch(/slot/);
    expect(nextRouteForFile('app/components/Button.tsx')).toBeUndefined();
    expect(nextRouteForFile('src/components/Button.tsx')).toBeUndefined();
    expect(nextRouteForFile('app/styles.css')).toBeUndefined();
  });
});

describe('Storybook index', () => {
  const stories = parseStoryIndex(INDEX);

  it('keeps stories, drops docs entries and malformed ones', () => {
    expect(stories.map((s) => s.id)).toEqual([
      'components-button--primary',
      'components-card--default',
      'forms-input--default',
    ]);
    expect(
      parseStoryIndex({ v: 3, stories: { a: { id: 'a', importPath: './a.stories.js' } } }),
    ).toHaveLength(1);
    expect(parseStoryIndex(null)).toEqual([]);
    expect(parseStoryIndex({ entries: 'x' })).toEqual([]);
  });

  it('matches story files, recorded components and sibling stories', () => {
    const byId = (id: string) => stories.find((s) => s.id === id) as StoryEntry;
    const button = byId('components-button--primary');
    expect(matchStory('src/components/Button.stories.tsx', button)).toBe('story-file');
    expect(matchStory('src/components/Button.tsx', button)).toBe('sibling-story');
    expect(matchStory('src/components/ButtonGroup.tsx', button)).toBeUndefined();
    expect(matchStory('src/components/Card.tsx', byId('components-card--default'))).toBe(
      'component-path',
    );
    expect(matchStory('src/forms/Input/index.ts', byId('forms-input--default'))).toBe(
      'sibling-story',
    );
    // importPath relative to a Storybook that lives in a workspace package
    expect(matchStory('packages/ui/src/components/Button.tsx', button, 'packages/ui')).toBe(
      'sibling-story',
    );
  });

  it('builds the isolated preview path', () => {
    expect(storyIframePath('a b&c')).toBe('iframe.html?id=a%20b%26c&viewMode=story');
  });
});

describe('targetsForChanges', () => {
  const routes = {
    'src/pages/checkout/**': ['/checkout'],
    'src/components/Header.tsx': ['/', '/about'],
  };

  it('maps changed files to routes, stories and files to lint', () => {
    const t = targetsForChanges({
      changedFiles: [
        'src/pages/checkout/Form.tsx',
        'src/components/Header.tsx',
        'src/components/Button.tsx',
        'src/components/Button.test.tsx',
        'README.md',
        'dist/bundle.js',
      ],
      routes,
      storybookIndex: INDEX,
      baseUrl: 'http://localhost:3000/',
    });
    expect(t.routes.map((r) => [r.route, r.url])).toEqual([
      ['/', 'http://localhost:3000/'],
      ['/about', 'http://localhost:3000/about'],
      ['/checkout', 'http://localhost:3000/checkout'],
    ]);
    expect(t.routes.find((r) => r.route === '/checkout')?.files).toEqual([
      'src/pages/checkout/Form.tsx',
    ]);
    expect(t.stories.map((s) => [s.id, s.path, s.via])).toEqual([
      [
        'components-button--primary',
        'iframe.html?id=components-button--primary&viewMode=story',
        ['sibling-story'],
      ],
    ]);
    expect(t.sourceFiles).toEqual([
      'src/components/Button.tsx',
      'src/components/Header.tsx',
      'src/pages/checkout/Form.tsx',
    ]);
    expect(t.unmapped).toEqual(['README.md', 'dist/bundle.js', 'src/components/Button.test.tsx']);
    expect(t.usedDefaults).toBe(false);
  });

  it('limits static lint to source folders and excludes', () => {
    const t = targetsForChanges({
      changedFiles: ['src/a.tsx', 'scripts/build.js', 'src/legacy/old.jsx', '.storybook/main.js'],
      sourceDirs: ['src'],
      exclude: ['src/legacy/**'],
    });
    expect(t.sourceFiles).toEqual(['src/a.tsx']);
  });

  it('makes absolute paths repo-relative and ignores paths outside the repo', () => {
    const t = targetsForChanges({
      changedFiles: ['/repo/src/a.tsx', '../outside.tsx', './src/b.tsx'],
      repoPath: '/repo',
    });
    expect(t.sourceFiles).toEqual(['src/a.tsx', 'src/b.tsx']);
  });

  it('derives Next.js routes only when asked, with notes for dynamic routes', () => {
    const files = ['app/checkout/page.tsx', 'app/product/[id]/page.tsx'];
    expect(targetsForChanges({ changedFiles: files }).routes).toEqual([]);
    const t = targetsForChanges({ changedFiles: files, nextjs: true });
    expect(t.routes.map((r) => [r.route, r.via])).toEqual([['/checkout', ['nextjs']]]);
    expect(t.notes.join('\n')).toMatch(/app\/product\/\[id\]\/page\.tsx: dynamic route segment/);
  });

  it('falls back to default targets when nothing maps to a route or story', () => {
    const t = targetsForChanges({
      changedFiles: ['src/util/format.ts'],
      routes,
      defaultTargets: ['/', 'https://evil.example/'],
      baseUrl: 'http://localhost:3000',
    });
    expect(t.usedDefaults).toBe(true);
    expect(t.routes.map((r) => [r.route, r.via])).toEqual([['/', ['default']]]);
    expect(t.notes.join('\n')).toMatch(/Ignored default target "https:\/\/evil.example\/"/);
    expect(t.notes.join('\n')).toMatch(/default targets were scanned/);
  });

  it('says so when nothing maps and there are no defaults', () => {
    const t = targetsForChanges({ changedFiles: ['docs/readme.md'], routes });
    expect(t.routes).toEqual([]);
    expect(t.notes.join('\n')).toMatch(/no pages were scanned/);
    expect(targetsForChanges({ changedFiles: [] }).notes).toEqual([]);
  });

  it('allTargets lists every configured route and story', () => {
    const t = allTargets({
      routes,
      storybookIndex: INDEX,
      defaultTargets: ['/', '/contact'],
      baseUrl: 'http://localhost:3000',
    });
    expect(t.routes.map((r) => r.route)).toEqual(['/', '/about', '/checkout', '/contact']);
    expect(t.stories).toHaveLength(3);
    expect(t.sourceFiles).toEqual([]);
  });
});

describe('results', () => {
  const finding = (file: string, url = `repo:${file}`): Finding =>
    createFinding({
      id: `id-${file}-${url}`,
      ruleId: 'repo/jsx-a11y/alt-text',
      wcag: ['1.1.1'],
      tier: 'likely',
      confidence: 0.7,
      engine: 'repo-eslint',
      page: { url, state: 'source', viewport: 'none' },
      target: { selector: '<img>' },
      evidence: {},
      ...(url.startsWith('repo:') ? { source: { file, line: 1 } } : {}),
      message: 'Image has no alt.',
    });
  const result = (findings: Finding[], extra: Partial<ScanResult> = {}): ScanResult => ({
    schemaVersion: 1,
    tool: { name: 'clear-a11y', version: '0.0.0' },
    startedAt: '2026-10-31T10:00:00.000Z',
    finishedAt: '2026-10-31T10:00:01.000Z',
    targets: ['repo:/r'],
    pages: [
      { url: 'repo:src/a.tsx', viewport: 'none', states: ['source'] },
      { url: 'repo:src/b.tsx', viewport: 'none', states: ['source'] },
    ],
    findings,
    errors: [
      { url: 'repo:src/b.tsx', state: 'source', viewport: 'none', engine: 'e', message: 'parse' },
      { url: 'repo:/r', state: 'source', viewport: 'none', engine: 'e', message: 'notice' },
    ],
    summary: summarize(findings),
    ...extra,
  });

  it('limits a repo result to the changed files, keeping repo-wide notices', () => {
    const r = limitResultToFiles(result([finding('src/a.tsx'), finding('src/b.tsx')]), [
      'src/a.tsx',
    ]);
    expect(r.findings.map((f) => f.source?.file)).toEqual(['src/a.tsx']);
    expect(r.pages.map((p) => p.url)).toEqual(['repo:src/a.tsx']);
    expect(r.errors.map((e) => e.message)).toEqual(['notice']);
    expect(r.summary.total).toBe(1);
  });

  it('keeps runtime pages selected by keepUrl, whatever their source file', () => {
    const story = 'repo:storybook-static/iframe.html?id=button--icon&viewMode=story';
    const storyFinding = {
      ...finding('src/Other.tsx', story),
      source: { file: 'src/Other.tsx', line: 3 },
    };
    const r = limitResultToFiles(
      result([finding('src/a.tsx'), finding('src/b.tsx'), storyFinding], {
        pages: [
          { url: 'repo:src/a.tsx', viewport: 'none', states: ['source'] },
          { url: story, viewport: 'desktop', states: ['default'] },
        ],
      }),
      ['src/a.tsx'],
      { keepUrl: (u) => u.startsWith('repo:storybook-static/') },
    );
    expect(r.findings.map((f) => f.page.url)).toEqual(['repo:src/a.tsx', story]);
    expect(r.pages.map((p) => p.url)).toEqual(['repo:src/a.tsx', story]);
  });

  it('merges results and recomputes the summary', () => {
    const a = result([finding('src/a.tsx')]);
    const b = result([finding('x', 'http://localhost/x'), finding('src/a.tsx')], {
      targets: ['http://localhost/x'],
      startedAt: '2026-10-31T09:00:00.000Z',
      finishedAt: '2026-10-31T11:00:00.000Z',
    });
    const m = mergeScanResults([a, b]);
    expect(m.findings).toHaveLength(2);
    expect(m.targets).toEqual(['repo:/r', 'http://localhost/x']);
    expect(m.startedAt).toBe('2026-10-31T09:00:00.000Z');
    expect(m.finishedAt).toBe('2026-10-31T11:00:00.000Z');
    expect(m.summary.total).toBe(2);
    expect(() => mergeScanResults([])).toThrow();
  });
});
