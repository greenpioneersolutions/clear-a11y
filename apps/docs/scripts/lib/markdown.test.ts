import { describe, expect, it } from 'vitest';
import { prefixRootLinks, withBase } from './base-links.ts';
import {
  dropParagraphStartingWith,
  extractTitle,
  parseFrontmatter,
  rewriteLinks,
} from './markdown.ts';
import { makeLinkResolver } from './routes.ts';

describe('parseFrontmatter', () => {
  it('reads scalars and inline lists', () => {
    const { data, body } = parseFrontmatter(
      '---\nid: keyboard/trap\ntitle: "Focus: trapped"\nwcag: [2.1.2, 2.4.3]\n---\n\n# Hi\n',
    );
    expect(data).toEqual({
      id: 'keyboard/trap',
      title: 'Focus: trapped',
      wcag: ['2.1.2', '2.4.3'],
    });
    expect(body).toBe('\n# Hi\n');
  });

  it('returns the whole text when there is no frontmatter', () => {
    expect(parseFrontmatter('# Title\n')).toEqual({ data: {}, body: '# Title\n' });
  });
});

describe('extractTitle and dropParagraphStartingWith', () => {
  it('removes the first heading only when it is the first content line', () => {
    expect(extractTitle('\n# Focus trap\n\nText')).toEqual({ title: 'Focus trap', body: 'Text' });
    expect(extractTitle('Intro\n\n# Later')).toEqual({ body: 'Intro\n\n# Later' });
  });

  it('drops the summary paragraph', () => {
    expect(dropParagraphStartingWith('**Rule:** `x` · tier\n\n## What', '**Rule:**')).toBe(
      '## What',
    );
  });
});

describe('rewriteLinks', () => {
  const resolve = (path: string, hash: string) => `<${path}${hash}>`;

  it('resolves relative links against the source file', () => {
    const out = rewriteLinks(
      'See [mcp](mcp.md), [rule](../rules/at/x.md#fix) and ![img](./a.png "A").',
      'docs/guides/page.md',
      resolve,
    );
    expect(out).toBe(
      'See [mcp](<docs/guides/mcp.md>), [rule](<docs/rules/at/x.md#fix>) and ![img](<docs/guides/a.png> "A").',
    );
  });

  it('leaves external, root-relative, same-page links and code alone', () => {
    const src = [
      '[w3c](https://www.w3.org/) [home](/getting-started/) [here](#fix) `[code](x.md)`',
      '```md',
      '[fenced](x.md)',
      '```',
    ].join('\n');
    expect(rewriteLinks(src, 'docs/a.md', resolve)).toBe(src);
  });
});

describe('makeLinkResolver', () => {
  const routes = new Map([
    ['docs/providers.md', 'guides/providers'],
    ['docs/adr/README.md', 'architecture/adr'],
  ]);
  const ctx = {
    routes,
    repoUrl: 'https://github.com/o/r',
    ref: 'main',
    exists: (p: string) => p === 'fixtures/site/a.html',
  };

  it('links published files to pages and other files to GitHub', () => {
    const problems: string[] = [];
    const resolve = makeLinkResolver(ctx, problems, 'docs/x.md');
    expect(resolve('docs/providers.md', '#keys')).toBe('/guides/providers/#keys');
    expect(resolve('docs/adr', '')).toBe('/architecture/adr/');
    expect(resolve('fixtures/site/a.html', '')).toBe(
      'https://github.com/o/r/blob/main/fixtures/site/a.html',
    );
    expect(problems).toEqual([]);
  });

  it('reports links to files that do not exist', () => {
    const problems: string[] = [];
    makeLinkResolver(ctx, problems, 'docs/x.md')('docs/missing.md', '');
    expect(problems).toEqual([
      'docs/x.md: link target docs/missing.md does not exist in the repository.',
    ]);
  });
});

describe('base path', () => {
  it('prefixes root-relative links once', () => {
    expect(withBase('/guides/', '/clear-a11y/')).toBe('/clear-a11y/guides/');
    expect(withBase('/clear-a11y/guides/', '/clear-a11y')).toBe('/clear-a11y/guides/');
    expect(withBase('https://x.org/', '/clear-a11y/')).toBe('https://x.org/');
    expect(withBase('//cdn.example/', '/clear-a11y/')).toBe('//cdn.example/');
    expect(withBase('/guides/', '/')).toBe('/guides/');
  });

  it('rewrites Markdown and HTML links outside code', () => {
    const body = '[a](/x/) <a href="/y/">y</a> `[c](/z/)`\n```\n[d](/w/)\n```';
    expect(prefixRootLinks(body, '/base/')).toBe(
      '[a](/base/x/) <a href="/base/y/">y</a> `[c](/z/)`\n```\n[d](/w/)\n```',
    );
    expect(prefixRootLinks(body, '/')).toBe(body);
  });
});
