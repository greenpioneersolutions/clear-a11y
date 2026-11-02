import { crawl, isAllowed, normalizeUrl, type CrawlOptions } from './crawl.js';

const site: Record<string, string[]> = {
  'http://a.test/': ['/about', '/blog/', 'https://evil.test/', 'mailto:x@y.z', '/file.pdf', '#top'],
  'http://a.test/about': ['/', '/team?x=1#frag'],
  'http://a.test/blog/': ['post-1', 'post-2', '/admin/'],
};
const links = async (url: string) => site[url] ?? [];
const opts = (o: Partial<CrawlOptions> = {}): CrawlOptions => ({
  start: ['http://a.test/'],
  maxPages: 20,
  sameOrigin: true,
  include: [],
  exclude: [],
  ...o,
});

describe('crawl', () => {
  it('stays on the target origin and skips non-pages', async () => {
    expect(await crawl(opts(), links)).toEqual([
      'http://a.test/',
      'http://a.test/about',
      'http://a.test/blog/',
      'http://a.test/team?x=1',
      'http://a.test/blog/post-1',
      'http://a.test/blog/post-2',
      'http://a.test/admin/',
    ]);
  });

  it('respects maxPages, include and exclude', async () => {
    expect(await crawl(opts({ maxPages: 2 }), links)).toHaveLength(2);
    expect(await crawl(opts({ exclude: ['/admin/*', 'post-2'] }), links)).not.toContain(
      'http://a.test/admin/',
    );
    const blog = await crawl(opts({ include: ['/blog/*'] }), links);
    expect(blog).toEqual([
      'http://a.test/',
      'http://a.test/blog/',
      'http://a.test/blog/post-1',
      'http://a.test/blog/post-2',
    ]);
  });

  it('survives a page that fails to load', async () => {
    expect(await crawl(opts(), async () => Promise.reject(new Error('boom')))).toEqual([
      'http://a.test/',
    ]);
  });
});

describe('url helpers', () => {
  it('normalizes and filters', () => {
    expect(normalizeUrl('/x#y', 'http://a.test/')).toBe('http://a.test/x');
    expect(normalizeUrl('javascript:alert(1)')).toBeUndefined();
    expect(isAllowed('http://b.test/', opts(), new Set(['http://a.test']))).toBe(false);
    expect(
      isAllowed('http://b.test/', opts({ sameOrigin: false }), new Set(['http://a.test'])),
    ).toBe(true);
  });
});
