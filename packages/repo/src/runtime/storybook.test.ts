import { join } from 'node:path';
import { fixturesReposDir } from '@clear-a11y/test-utils';
import {
  assertLocalStorybookUrl,
  fetchStoryIndex,
  isLocalUrl,
  readStaticStoryIndex,
  resolveStoryFile,
  storybookProjectDirs,
  type FetchLike,
} from './storybook.js';

const sample = join(fixturesReposDir(), 'storybook-sample');

describe('local Storybook URLs', () => {
  it('accepts only this machine', () => {
    for (const ok of [
      'http://localhost:6006/',
      'http://127.0.0.1:6006',
      'https://ui.localhost/',
      'http://[::1]:6006/',
    ])
      expect(isLocalUrl(ok), ok).toBe(true);
    for (const bad of [
      'https://storybook.example.com/',
      'http://10.0.0.5:6006/',
      'file:///tmp/index.json',
      'http://localhost.evil.com/',
      'not a url',
    ])
      expect(isLocalUrl(bad), bad).toBe(false);
  });

  it('normalizes the base URL and rejects remote ones', () => {
    expect(assertLocalStorybookUrl('http://localhost:6006')).toBe('http://localhost:6006/');
    expect(assertLocalStorybookUrl('http://localhost:6006/iframe.html?id=a')).toBe(
      'http://localhost:6006/',
    );
    expect(() => assertLocalStorybookUrl('https://example.com/')).toThrow(/this machine/);
  });
});

describe('story index loading', () => {
  it('reads index.json from the built Storybook fixture', async () => {
    const index = await readStaticStoryIndex(sample, 'storybook-static');
    expect(index.version).toBe(5);
    expect(index.entries.filter((e) => e.type === 'story')).toHaveLength(8);
    expect(index.entries.filter((e) => e.type === 'docs')).toHaveLength(2);
  });

  it('explains a missing index', async () => {
    await expect(readStaticStoryIndex(sample, 'src')).rejects.toThrow(/storybook build/);
  });

  it('fetches index.json from a running local Storybook, falling back to stories.json', async () => {
    const seen: string[] = [];
    const fetch: FetchLike = async (url) => {
      seen.push(url);
      return url.endsWith('index.json')
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ v: 3, stories: {} }) };
    };
    const index = await fetchStoryIndex('http://127.0.0.1:6006', { fetch });
    expect(index.version).toBe(3);
    expect(seen).toEqual([
      'http://127.0.0.1:6006/index.json',
      'http://127.0.0.1:6006/stories.json',
    ]);
    await expect(fetchStoryIndex('https://example.com/', { fetch })).rejects.toThrow(
      /this machine/,
    );
    const failing: FetchLike = async () => Promise.reject(new Error('ECONNREFUSED'));
    await expect(fetchStoryIndex('http://localhost:1/', { fetch: failing })).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});

describe('story files', () => {
  it('resolves importPath against the Storybook project folders, existing file first', async () => {
    const dirs = storybookProjectDirs(
      {
        storybook: {
          present: true,
          configDirs: ['.storybook'],
          staticDirs: [],
          inDependencies: true,
        },
      },
      { kind: 'static', dir: 'storybook-static' },
    );
    expect(dirs).toEqual(['.']);
    expect(await resolveStoryFile(sample, './src/components/Button.stories.tsx', dirs)).toBe(
      'src/components/Button.stories.tsx',
    );
    const mono = storybookProjectDirs(
      {
        storybook: {
          present: true,
          configDirs: ['packages/ui/.storybook'],
          staticDirs: [],
          inDependencies: true,
        },
      },
      { kind: 'static', dir: 'out/storybook' },
    );
    expect(mono).toEqual(['out', 'packages/ui', '.']);
    // Nothing exists in this repo for these: first candidate wins.
    expect(await resolveStoryFile(sample, './src/X.stories.tsx', mono)).toBe(
      'out/src/X.stories.tsx',
    );
    expect(await resolveStoryFile(sample, '../../../x', ['.'])).toBeUndefined();
  });
});
