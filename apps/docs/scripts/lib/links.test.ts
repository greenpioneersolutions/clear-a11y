import { describe, expect, it } from 'vitest';
import { checkLinks, extractIds, extractUrls, pageUrl } from './links.ts';

describe('extractUrls and extractIds', () => {
  it('reads link targets and ids', () => {
    const html =
      '<a href="/a/?x=1&amp;y=2">A</a><link rel="stylesheet" href="/s.css"><script src="/j.js"></script><h2 id="intro">x</h2><a name="old"></a>';
    expect(extractUrls(html)).toEqual(['/a/?x=1&y=2', '/s.css', '/j.js']);
    expect([...extractIds(html)]).toEqual(['intro', 'old']);
  });
});

describe('pageUrl', () => {
  it('maps built files to URLs under the base', () => {
    expect(pageUrl('index.html', '/')).toBe('/');
    expect(pageUrl('guides/cli/index.html', '/clear-a11y')).toBe('/clear-a11y/guides/cli/');
  });
});

describe('checkLinks', () => {
  const pages = [
    {
      path: 'index.html',
      html: '<a href="/b/guides/cli/#flags">CLI</a><a href="https://w3.org/">W3C</a><a href="#top">top</a><h1 id="top">Home</h1>',
    },
    {
      path: 'guides/cli/index.html',
      html: '<h2 id="flags">Flags</h2><a href="../../">Home</a><a href="../missing/">x</a><link href="/b/style.css">',
    },
  ];

  it('accepts valid pages, anchors, relative links and assets; ignores external links', () => {
    expect(
      checkLinks(
        pages
          .slice(0, 1)
          .concat({ ...pages[1]!, html: '<h2 id="flags">Flags</h2><a href="../../">Home</a>' }),
        '/b/',
        () => true,
      ),
    ).toEqual([]);
  });

  it('reports broken pages, missing anchors, missing assets and links outside the base', () => {
    const broken = [
      {
        path: 'index.html',
        html: '<a href="/b/guides/cli/#nope">CLI</a><a href="/elsewhere/">out</a>',
      },
      pages[1]!,
    ];
    expect(checkLinks(broken, '/b/', (f) => f !== 'style.css')).toEqual([
      'index.html: /b/guides/cli/#nope points to a missing anchor #nope',
      'index.html: /elsewhere/ is outside the base path /b/',
      'guides/cli/index.html: broken link ../missing/',
      'guides/cli/index.html: missing file /b/style.css',
    ]);
  });
});
