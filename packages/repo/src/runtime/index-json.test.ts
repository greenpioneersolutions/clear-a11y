import {
  parseStoryIndex,
  selectStories,
  storyExportLine,
  storyFileInRepo,
  storyIdFromUrl,
  storyIframeUrl,
  storyMatchesFilter,
  type StoryIndexEntry,
} from './index-json.js';

const v5 = {
  v: 5,
  entries: {
    'intro--docs': {
      id: 'intro--docs',
      title: 'Intro',
      name: 'Docs',
      importPath: './src/Intro.mdx',
      type: 'docs',
      tags: ['unattached-mdx'],
    },
    'components-button--primary': {
      type: 'story',
      id: 'components-button--primary',
      title: 'Components/Button',
      name: 'Primary',
      importPath: './src/Button.stories.tsx',
      tags: ['dev'],
    },
    'components-button--icon-only': {
      type: 'story',
      id: 'components-button--icon-only',
      title: 'Components/Button',
      name: 'Icon Only',
      importPath: './src/Button.stories.tsx',
    },
    broken: { type: 'story', title: 'No id' },
  },
};

const entry = (id: string, title = 'Components/Button'): StoryIndexEntry => ({
  id,
  title,
  name: id,
  importPath: './x.stories.tsx',
  type: 'story',
  tags: [],
});

describe('parseStoryIndex', () => {
  it('reads Storybook 7/8 index.json (v4/v5 entries) and counts entries it cannot use', () => {
    const index = parseStoryIndex(v5);
    expect(index.version).toBe(5);
    expect(index.invalid).toBe(1);
    expect(index.entries.map((e) => [e.id, e.type])).toEqual([
      ['intro--docs', 'docs'],
      ['components-button--primary', 'story'],
      ['components-button--icon-only', 'story'],
    ]);
    expect(index.entries[1]).toEqual({
      id: 'components-button--primary',
      title: 'Components/Button',
      name: 'Primary',
      importPath: './src/Button.stories.tsx',
      type: 'story',
      tags: ['dev'],
    });
  });

  it('reads legacy stories.json (v3: kind/story, parameters.fileName, docsOnly)', () => {
    const index = parseStoryIndex({
      v: 3,
      stories: {
        'button--primary': {
          id: 'button--primary',
          kind: 'Button',
          story: 'Primary',
          parameters: { fileName: './src/Button.stories.js' },
        },
        'intro--page': {
          id: 'intro--page',
          kind: 'Intro',
          name: 'Page',
          importPath: './src/Intro.stories.mdx',
          parameters: { docsOnly: true },
        },
      },
    });
    expect(index.version).toBe(3);
    expect(index.entries).toEqual([
      {
        id: 'button--primary',
        title: 'Button',
        name: 'Primary',
        importPath: './src/Button.stories.js',
        type: 'story',
        tags: [],
      },
      {
        id: 'intro--page',
        title: 'Intro',
        name: 'Page',
        importPath: './src/Intro.stories.mdx',
        type: 'docs',
        tags: [],
      },
    ]);
  });

  it('rejects documents that are not a story index', () => {
    expect(() => parseStoryIndex(null)).toThrow(/not a Storybook index/);
    expect(() => parseStoryIndex({ v: 5 })).toThrow(/no "entries"/);
    expect(() => parseStoryIndex([1, 2])).toThrow(/not a Storybook index/);
  });
});

describe('story URLs', () => {
  it('builds the preview iframe URL and escapes the id', () => {
    expect(storyIframeUrl('http://127.0.0.1:6006', 'button--primary')).toBe(
      'http://127.0.0.1:6006/iframe.html?id=button--primary&viewMode=story',
    );
    expect(storyIframeUrl('http://localhost:6006/sb/', 'a b&c=d')).toBe(
      'http://localhost:6006/sb/iframe.html?id=a%20b%26c%3Dd&viewMode=story',
    );
  });

  it('reads the story id back from http and repo: URLs', () => {
    const url = storyIframeUrl('http://127.0.0.1:1/', 'a b&c');
    expect(storyIdFromUrl(url)).toBe('a b&c');
    expect(
      storyIdFromUrl(
        'repo:storybook-static/iframe.html?id=components-card--default&viewMode=story',
      ),
    ).toBe('components-card--default');
    expect(storyIdFromUrl('http://127.0.0.1/page.html?id=x')).toBeUndefined();
    expect(storyIdFromUrl('repo:src/App.tsx')).toBeUndefined();
  });
});

describe('selectStories', () => {
  const entries = [
    ...parseStoryIndex(v5).entries,
    entry('components-tabs--default', 'Components/Tabs'),
    entry('legacy-old--story', 'Legacy/Old'),
  ];

  it('skips docs entries, applies the filter and the cap', () => {
    expect(selectStories(entries, { max: 50 })).toMatchObject({
      docs: 1,
      filteredOut: 0,
      truncated: 0,
    });
    const capped = selectStories(entries, { max: 2 });
    expect(capped.stories.map((s) => s.id)).toEqual([
      'components-button--primary',
      'components-button--icon-only',
    ]);
    expect(capped.truncated).toBe(2);
    const filtered = selectStories(entries, { max: 50, filter: ['!Legacy/**'] });
    expect(filtered.filteredOut).toBe(1);
    expect(filtered.stories).toHaveLength(3);
  });

  it('matches globs against id and title; ! excludes', () => {
    const e = entry('components-button--primary', 'Components/Button');
    expect(storyMatchesFilter(e, [])).toBe(true);
    expect(storyMatchesFilter(e, ['components-button--*'])).toBe(true);
    expect(storyMatchesFilter(e, ['Components/*'])).toBe(true);
    expect(storyMatchesFilter(e, ['Forms/**'])).toBe(false);
    expect(storyMatchesFilter(e, ['Components/**', '!*--primary'])).toBe(false);
    expect(storyMatchesFilter(e, ['!Forms/**'])).toBe(true);
  });
});

describe('story files', () => {
  it('normalizes importPath to a repo-relative POSIX path', () => {
    expect(storyFileInRepo('./src/Button.stories.tsx')).toBe('src/Button.stories.tsx');
    expect(storyFileInRepo('./src/Button.stories.tsx', 'packages/ui')).toBe(
      'packages/ui/src/Button.stories.tsx',
    );
    expect(storyFileInRepo('.\\src\\A.stories.tsx')).toBe('src/A.stories.tsx');
    expect(storyFileInRepo('../../etc/passwd')).toBeUndefined();
    expect(storyFileInRepo('../ui/A.stories.tsx', 'apps/web')).toBe('apps/ui/A.stories.tsx');
    expect(storyFileInRepo('/abs/A.stories.tsx')).toBeUndefined();
    expect(storyFileInRepo('C:/abs/A.stories.tsx')).toBeUndefined();
  });

  it('finds the line of a story export from its name', () => {
    const src = [
      "import { Button } from './Button';",
      'export default { title: "Button" };',
      'export const Primary = {};',
      '',
      'export const IconOnly: Story = { args: {} };',
    ].join('\n');
    expect(storyExportLine(src, 'Primary')).toBe(3);
    expect(storyExportLine(src, 'Icon Only')).toBe(5);
    expect(storyExportLine(src, 'Missing')).toBeUndefined();
    expect(storyExportLine(src, '  ')).toBeUndefined();
  });
});
