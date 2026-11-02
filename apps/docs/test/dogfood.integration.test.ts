import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { launchBrowser, type BrowserSession, type Page } from '@clear-a11y/browser';
import type { Finding, Viewport } from '@clear-a11y/core';
import { scan } from '@clear-a11y/runner';
import { startStaticServer, type StaticServer } from '@clear-a11y/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkLinks, type BuiltPage } from '../scripts/lib/links.ts';

/**
 * Practice what we test: the built docs site must pass Clear A11Y. Serves apps/docs/dist (under
 * DOCS_BASE when set, exactly as GitHub Pages will) and scans representative pages with every
 * engine at desktop and mobile sizes. Run with `nx test-integration docs` (builds the site first).
 */
const appRoot = join(import.meta.dirname, '..');
const distDir = join(appRoot, 'dist');
const outDir = join(appRoot, 'test-output');
const base = `/${(process.env['DOCS_BASE'] ?? '').replace(/^\/+|\/+$/g, '')}/`.replace(
  /^\/\/$/,
  '/',
);

/** Home, getting started, a guide, both generated references, a rule page, the rule indexes, the benchmark page. */
const PAGES = [
  '',
  'getting-started/',
  'guides/cli/',
  'reference/cli/',
  'reference/rules/',
  'reference/rules/keyboard/focus-order-backward/',
  'reference/rules/by-wcag/',
  'concepts/coverage/',
];
const VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 320, height: 640 },
];

const describeFinding = (f: Finding) =>
  `${f.tier} ${f.ruleId} on ${f.page.url} [${f.page.viewport}, ${f.page.state}] ${f.target.selector}: ${f.message}`;

async function builtPages(dir: string): Promise<BuiltPage[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => join(e.parentPath, e.name));
  return Promise.all(
    files.sort().map(async (f) => ({
      path: relative(dir, f).split(sep).join('/'),
      html: await readFile(f, 'utf-8'),
    })),
  );
}

/** Opens the search dialog and searches, so the dialog and its results are what gets scanned. */
async function openSearch(page: Page): Promise<void> {
  const button = page.locator('button[data-open-modal]').first();
  await button.waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => !document.querySelector('button[data-open-modal]')?.hasAttribute('disabled'),
  );
  await button.click();
  const input = page.locator('#starlight__search input');
  await input.fill('focus order');
  await page
    .locator('#starlight__search .pagefind-ui__result')
    .first()
    .waitFor({ timeout: 15_000 });
}

describe('docs site dogfood (integration)', () => {
  let server: StaticServer;
  let session: BrowserSession;
  let tmp: string | undefined;
  const url = (path: string) => server.url(`${base}${path}`);

  beforeAll(async () => {
    expect(existsSync(join(distDir, 'index.html')), 'build the site first: nx run docs:build').toBe(
      true,
    );
    let root = distDir;
    if (base !== '/') {
      // Serve dist/ under the base path, the way GitHub Pages serves a project site.
      tmp = await mkdtemp(join(tmpdir(), 'clear-a11y-docs-'));
      const mount = join(tmp, ...base.split('/').filter(Boolean));
      await mkdir(dirname(mount), { recursive: true });
      await symlink(distDir, mount, 'dir');
      root = tmp;
    }
    server = await startStaticServer({ root });
    session = await launchBrowser();
    await mkdir(join(outDir, 'screenshots'), { recursive: true });
  }, 120_000);

  afterAll(async () => {
    await session?.close();
    await server?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('has no broken internal links or anchors', async () => {
    const pages = await builtPages(distDir);
    expect(pages.length).toBeGreaterThan(50);
    expect(checkLinks(pages, base, (file) => existsSync(join(distDir, file)))).toEqual([]);
  });

  it('loads nothing from other origins and throws no script errors', async () => {
    for (const viewport of VIEWPORTS) {
      const opened = await session.newPage(viewport);
      try {
        const external: string[] = [];
        const errors: string[] = [];
        opened.page.on('request', (r) => {
          if (!r.url().startsWith(server.origin)) external.push(r.url());
        });
        opened.page.on('pageerror', (e) => errors.push(e.message));
        for (const path of [...PAGES, 'guides/desktop/']) {
          const response = await opened.page.goto(url(path), { waitUntil: 'networkidle' });
          expect(response?.status(), path).toBe(200);
        }
        await openSearch(opened.page);
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        await opened.close();
      }
    }
  });

  it('takes screenshots at 1280 and 320 CSS px', async () => {
    for (const viewport of VIEWPORTS) {
      const opened = await session.newPage(viewport);
      try {
        for (const [name, path] of [
          ['home', ''],
          ['rule', 'reference/rules/keyboard/focus-order-backward/'],
          ['coverage', 'concepts/coverage/'],
        ] as const) {
          await opened.page.goto(url(path), { waitUntil: 'networkidle' });
          const file = join(outDir, 'screenshots', `${name}-${viewport.width}.png`);
          await opened.page.screenshot({ path: file, fullPage: true });
          expect((await stat(file)).size).toBeGreaterThan(10_000);
        }
        // No sideways scrolling at 320 px.
        const width = await opened.page.evaluate(() => document.documentElement.scrollWidth);
        expect(width).toBeLessThanOrEqual(viewport.width);
      } finally {
        await opened.close();
      }
    }
  });

  it('passes a full Clear A11Y scan at desktop and mobile sizes: zero findings of any tier', async () => {
    const result = await scan({
      targets: PAGES.map(url),
      session,
      config: { viewports: VIEWPORTS },
    });
    const summary = result.findings.map(describeFinding);
    await writeFile(join(outDir, 'dogfood-findings.json'), JSON.stringify(result, null, 2));
    expect(result.errors).toEqual([]);
    expect(result.pages.every((p) => !p.error)).toBe(true);
    expect(summary).toEqual([]);
  }, 1_200_000);

  it('passes with the search dialog open and showing results', async () => {
    const result = await scan({
      targets: [url('')],
      session,
      config: { viewports: VIEWPORTS },
      states: false,
      prepare: openSearch,
    });
    expect(result.errors).toEqual([]);
    expect(result.findings.map(describeFinding)).toEqual([]);
  }, 600_000);
});
