import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createFinding, type Finding } from '@clear-a11y/core';
import {
  attributesFromHtml,
  parseSourceRef,
  sourceAttributesProbe,
  sourceRefFromAttributes,
} from './attributes.js';
import { mapFindingsToSource, normalizeRepoPath } from './map-findings.js';
import { fileFromReactSource, reactDebugSourceProbe } from './react-fiber.js';
import { cluesFromFinding, scoreCandidates, searchClues } from './search.js';

const runtime = (selector: string, html?: string, name?: string): Finding =>
  createFinding({
    ruleId: 'static/image-alt',
    wcag: ['1.1.1'],
    tier: 'violation',
    confidence: 1,
    engine: 'engine-static',
    page: { url: 'http://localhost:5173/' },
    target: { selector, ...(name ? { name } : {}) },
    evidence: html ? { html } : {},
    message: 'Image has no alt text.',
  });

/** A fake DOM element chain for the in-page probes. */
const fakeEl = (attrs: Record<string, string>, parent: unknown = null, extra = {}) =>
  ({
    getAttribute: (n: string) => attrs[n] ?? null,
    parentElement: parent,
    ...extra,
  }) as unknown as Element;

describe('attribute convention', () => {
  it('parses file:line[:column], including Windows paths', () => {
    expect(parseSourceRef('src/App.tsx:12')).toEqual({ file: 'src/App.tsx', line: 12 });
    expect(parseSourceRef('src/App.tsx:12:5')).toEqual({
      file: 'src/App.tsx',
      line: 12,
      column: 5,
    });
    expect(parseSourceRef('C:\\app\\src\\App.tsx:3:1')).toEqual({
      file: 'C:\\app\\src\\App.tsx',
      line: 3,
      column: 1,
    });
    expect(parseSourceRef('src/App.tsx')).toBeUndefined();
    expect(parseSourceRef('src/App.tsx:0')).toBeUndefined();
  });

  it('reads the combined attribute and the file/line pairs', () => {
    expect(sourceRefFromAttributes({ 'data-clear-a11y-src': 'src/A.tsx:4' })).toEqual({
      file: 'src/A.tsx',
      line: 4,
    });
    expect(
      sourceRefFromAttributes({
        'data-source-file': 'src/B.tsx',
        'data-source-line': '7',
        'data-source-column': '3',
      }),
    ).toEqual({ file: 'src/B.tsx', line: 7, column: 3 });
    expect(
      sourceRefFromAttributes({
        'data-inspector-relative-path': 'src/C.tsx',
        'data-inspector-line': '9',
      }),
    ).toEqual({ file: 'src/C.tsx', line: 9 });
    expect(sourceRefFromAttributes({ 'data-source-file': 'src/B.tsx' })).toBeUndefined();
  });

  it('extracts attributes from an HTML snippet', () => {
    expect(
      attributesFromHtml(
        '<img src="a.png" data-clear-a11y-src="src/A.tsx:4" class=\'x y\' hidden data-n=1>',
      ),
    ).toEqual({
      src: 'a.png',
      'data-clear-a11y-src': 'src/A.tsx:4',
      class: 'x y',
      hidden: '',
      'data-n': '1',
    });
    expect(attributesFromHtml('<a title="&quot;Q&quot; &amp; A">x</a>')).toEqual({
      title: '"Q" & A',
    });
    expect(attributesFromHtml(undefined)).toEqual({});
  });

  it('sourceAttributesProbe returns the nearest ancestor-or-self with source attributes', () => {
    const root = fakeEl({ 'data-clear-a11y-src': 'src/App.tsx:3' });
    const mid = fakeEl({ class: 'card' }, root);
    const leaf = fakeEl({}, mid);
    expect(sourceAttributesProbe(leaf)).toEqual({ 'data-clear-a11y-src': 'src/App.tsx:3' });
    expect(sourceAttributesProbe(fakeEl({}))).toBeNull();
  });
});

describe('React debug source', () => {
  it('reads _debugSource from the fiber (React <= 18)', () => {
    const fiber = {
      return: { _debugSource: { fileName: '/r/src/Card.tsx', lineNumber: 14, columnNumber: 7 } },
    };
    const el = fakeEl({}, null, { __reactFiber$abc123: fiber });
    expect(reactDebugSourceProbe(el)).toEqual({
      fileName: '/r/src/Card.tsx',
      lineNumber: 14,
      columnNumber: 7,
      fromStack: false,
    });
  });

  it('falls back to _debugStack (React 19), skipping React frames', () => {
    const stack = [
      'Error: react-stack-top-frame',
      '    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js:250:30)',
      '    at ProductCard (http://localhost:5173/src/components/ProductCard.tsx?t=1700:14:7)',
    ].join('\n');
    const el = fakeEl({}, null, { __reactFiber$x: { _debugStack: { stack } } });
    expect(reactDebugSourceProbe(el)).toEqual({
      fileName: 'http://localhost:5173/src/components/ProductCard.tsx?t=1700',
      lineNumber: 14,
      columnNumber: 7,
      fromStack: true,
    });
    expect(reactDebugSourceProbe(fakeEl({}))).toBeNull();
  });

  it('turns React file names into repo paths', () => {
    expect(fileFromReactSource('http://localhost:5173/src/App.tsx?t=1')).toBe('/src/App.tsx');
    expect(fileFromReactSource('webpack-internal:///./src/App.tsx')).toBe('./src/App.tsx');
    expect(fileFromReactSource('/abs/src/App.tsx')).toBe('/abs/src/App.tsx');
  });
});

describe('normalizeRepoPath', () => {
  it.each([
    ['/repo/src/App.tsx', '/repo', 'src/App.tsx'],
    ['./src/App.tsx', '/repo', 'src/App.tsx'],
    ['/src/App.tsx', '/repo', 'src/App.tsx'],
    ['src\\components\\Card.tsx', '/repo', 'src/components/Card.tsx'],
    ['C:\\work\\app\\src\\App.tsx', 'C:\\work\\app', 'src/App.tsx'],
    ['c:/work/app/src/App.tsx', 'C:\\work\\app\\', 'src/App.tsx'],
    ['D:\\other\\App.tsx', 'C:\\work\\app', undefined],
    ['../secret.tsx', '/repo', undefined],
    ['src/../../x.tsx', '/repo', undefined],
  ])('%s in %s -> %s', (file, root, expected) => {
    expect(normalizeRepoPath(file, root)).toBe(expected);
  });
});

describe('literal search', () => {
  const files = new Map([
    [
      'src/Signup.tsx',
      [
        'export function Signup() {',
        '  return (',
        '    <form className="signup">',
        '      <input id="signup-email" className="field field--email" />',
        '      <button data-testid="signup-submit" className="btn">Create account</button>',
        '    </form>',
        '  );',
        '}',
      ].join('\n'),
    ],
    ['src/Other.tsx', 'export const O = () => <div className="btn field">Create account</div>;'],
  ]);

  it('extracts id, test id, classes and text from a finding', () => {
    expect(cluesFromFinding(runtime('form > #signup-email'))).toEqual({
      id: 'signup-email',
      classes: [],
    });
    expect(
      cluesFromFinding(
        runtime(
          'button',
          '<button data-testid="signup-submit" class="btn css-1x2y3">Create account</button>',
        ),
      ),
    ).toEqual({ testId: 'signup-submit', classes: ['btn'], text: 'Create account' });
    expect(cluesFromFinding(runtime('#a\\:b'))).toMatchObject({ id: 'a:b' });
  });

  it('scores a unique id high enough to map, and ambiguous clues low', () => {
    const byId = scoreCandidates(searchClues(files, { id: 'signup-email', classes: [] }));
    expect(byId[0]).toMatchObject({
      file: 'src/Signup.tsx',
      line: 4,
      strategy: 'id',
      confidence: 0.9,
    });
    const ambiguous = scoreCandidates(searchClues(files, { classes: [], text: 'Create account' }));
    expect(ambiguous.every((c) => c.confidence < 0.8)).toBe(true);
  });

  it('combines independent weak clues that agree on the same spot', () => {
    const c = scoreCandidates(
      searchClues(files, { classes: ['field--email'], text: 'Create account' }),
    );
    // class (unique, 0.6) is on line 4; text appears twice (0.25 each), one on line 5.
    expect(c[0]).toMatchObject({ file: 'src/Signup.tsx', strategy: 'combined' });
    expect(c[0]?.confidence).toBeCloseTo(0.7, 2);
  });
});

describe('mapFindingsToSource', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'clear-a11y-map-'));
    const write = async (path: string, content: string) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    };
    await write('package.json', JSON.stringify({ dependencies: { react: '18' } }));
    await write(
      'src/Card.tsx',
      'export const Card = () => (\n  <div>\n    <img id="hero-image" src="a.png" />\n  </div>\n);\n',
    );
    await write('src/Dup.tsx', 'export const D = () => <p className="note">Hello there</p>;\n');
    await write('src/Dup2.tsx', 'export const E = () => <p className="note">Hello there</p>;\n');
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('uses source attributes first, then unique ids; never guesses', async () => {
    const [byAttr, byId, ambiguous, outside] = await mapFindingsToSource(
      [
        runtime('img', '<img data-clear-a11y-src="src/Card.tsx:3:5" src="a.png">'),
        runtime('#hero-image'),
        runtime('p.note', '<p class="note">Hello there</p>'),
        runtime('img', '<img data-clear-a11y-src="../etc/passwd:1">'),
      ],
      root,
    );
    expect(byAttr?.source).toEqual({ file: 'src/Card.tsx', line: 3, column: 5 });
    expect(byAttr?.evidence.data?.['sourceMatch']).toEqual({
      strategy: 'attribute',
      confidence: 1,
    });
    expect(byId?.source).toEqual({ file: 'src/Card.tsx', line: 3 });
    expect(ambiguous?.source).toBeUndefined();
    expect(ambiguous?.evidence.data?.['sourceCandidates']).toHaveLength(2);
    expect(outside?.source).toBeUndefined();
  });

  it('uses page hints (probe results) and React debug info', async () => {
    const f = runtime('div > img');
    const [viaHint] = await mapFindingsToSource([f], root, {
      hints: () => ({
        attributes: { 'data-source-file': 'src/Card.tsx', 'data-source-line': '2' },
      }),
    });
    expect(viaHint?.source).toEqual({ file: 'src/Card.tsx', line: 2 });
    const [viaReact] = await mapFindingsToSource([f], root, {
      hints: () => ({
        react: {
          fileName: join(root, 'src/Card.tsx'),
          lineNumber: 3,
          columnNumber: 5,
          fromStack: false,
        },
      }),
    });
    expect(viaReact?.source).toEqual({ file: 'src/Card.tsx', line: 3, column: 5 });
    const [fromStack] = await mapFindingsToSource([f], root, {
      hints: () => ({
        react: { fileName: 'http://localhost:5173/src/Card.tsx', lineNumber: 3, fromStack: true },
      }),
    });
    expect(fromStack?.source).toBeUndefined();
    expect(fromStack?.evidence.data?.['sourceCandidates']).toEqual([
      { file: 'src/Card.tsx', line: 3, strategy: 'react-debug-source', confidence: 0.6 },
    ]);
  });

  it('leaves findings that already have a source alone and does not mutate inputs', async () => {
    const f = { ...runtime('#hero-image'), source: { file: 'x.tsx', line: 1 } };
    const g = runtime('#hero-image');
    const [a, b] = await mapFindingsToSource([f, g], root);
    expect(a).toBe(f);
    expect(g.source).toBeUndefined();
    expect(b?.source).toBeDefined();
  });
});
