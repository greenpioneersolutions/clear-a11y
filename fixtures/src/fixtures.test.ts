import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ExpectedPageSchema, getSuccessCriterion, LAYERS } from '@clear-a11y/core';
import { expectedDir, siteDir } from './index.js';

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const expectedFiles = walk(expectedDir).filter((f) => f.endsWith('.json'));
const pages = walk(siteDir).filter((f) => f.endsWith('.html'));

describe('fixtures', () => {
  it.each(expectedFiles.map((f) => [relative(expectedDir, f), f]))(
    '%s is valid and points at a page',
    (_name, file) => {
      const page = ExpectedPageSchema.parse(JSON.parse(readFileSync(file, 'utf-8')));
      expect(relative(expectedDir, file).replace(/\.json$/, '.html')).toBe(page.page);
      expect(existsSync(join(siteDir, page.page))).toBe(true);
      if (page.correctPattern) expect(page.issues).toEqual([]);
      else expect(page.issues.length).toBeGreaterThan(0);
      for (const issue of page.issues) {
        expect(issue.selector).not.toBe('TODO');
        expect(LAYERS as readonly string[]).toContain(issue.layer);
        for (const sc of issue.wcag)
          expect(getSuccessCriterion(sc), `${issue.id}: unknown SC ${sc}`).toBeDefined();
      }
    },
  );

  it('every page has an expected-findings file', () => {
    for (const page of pages) {
      expect(
        existsSync(join(expectedDir, relative(siteDir, page).replace(/\.html$/, '.json'))),
        page,
      ).toBe(true);
    }
  });

  it('every page declares a language and a title, except the missing-lang and page-titled barriers', () => {
    for (const page of pages) {
      const html = readFileSync(page, 'utf-8');
      if (!page.endsWith('wcag/2-4-2-page-titled.html'))
        expect(html, page).toMatch(/<title>[^<]+<\/title>/);
      if (!page.endsWith('missing-lang.html')) expect(html, page).toMatch(/<html lang="[a-z-]+">/);
    }
  });

  it('every barrier area has a correct-pattern page', () => {
    const areas = new Set(
      pages
        .map((p) => relative(siteDir, p).split('/'))
        .filter((p) => p.length > 1)
        .map((p) => p[0]),
    );
    for (const area of areas)
      expect(existsSync(join(siteDir, area as string, 'ok.html')), area).toBe(true);
  });
});
