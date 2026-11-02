import type { ClearA11yConfig, Viewport } from '@clear-a11y/core';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright';
import { nullArtifactSink } from './artifacts.js';
import { silentLogger } from './logger.js';
import type { ArtifactSink, Logger, PageContext, PassInput, StateMeta } from './types.js';

/** Common viewports. `reflow` is the WCAG 1.4.10 width (320 CSS px). */
export const VIEWPORTS = {
  desktop: { name: 'desktop', width: 1280, height: 800 },
  mobile: { name: 'mobile', width: 375, height: 812 },
  reflow: { name: 'reflow', width: 320, height: 256 },
} as const satisfies Record<string, Viewport>;

export interface LaunchOptions {
  headless?: boolean;
  /** Playwright storage state file for authenticated scans. */
  storageState?: string;
  /** Use a specific Chromium build instead of Playwright's managed one (e.g. a browser the user located). */
  executablePath?: string;
}

export interface OpenedPage {
  page: Page;
  context: BrowserContext;
  close(): Promise<void>;
}

export interface BrowserSession {
  browser: Browser;
  /** Opens a fresh, isolated page at the given viewport (new context: no shared cookies or focus). */
  newPage(viewport: Viewport): Promise<OpenedPage>;
  close(): Promise<void>;
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
  });
  return {
    browser,
    async newPage(viewport) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        ...(options.storageState ? { storageState: options.storageState } : {}),
        reducedMotion: 'reduce',
        // Engines inject helpers and axe-core; sites with a strict CSP would otherwise block them.
        bypassCSP: true,
        locale: 'en-US',
      });
      const page = await context.newPage();
      return { page, context, close: () => context.close() };
    },
    close: () => browser.close(),
  };
}

/** Loads `url` and waits until the page is settled enough to analyze. */
/**
 * True when navigating from `current` to `next` stays in the same document (only the fragment
 * differs or nothing does). Browsers then don't reload, so leftover page state would survive.
 */
export function isSameDocument(current: string, next: string): boolean {
  if (!current || current === 'about:blank') return false;
  try {
    const a = new URL(current);
    const b = new URL(next);
    a.hash = '';
    b.hash = '';
    return a.href === b.href;
  } catch {
    return false;
  }
}

/** Loads `url` as a fresh document (a real reload even for hash URLs) and waits until it settles. */
export async function gotoAndSettle(page: Page, url: string, timeoutMs = 30_000): Promise<void> {
  if (isSameDocument(page.url(), url)) {
    await page.goto('about:blank', { timeout: timeoutMs });
  }
  await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
  await page
    .waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5_000) })
    .catch(() => undefined);
}

export function createPageContext(input: {
  page: Page;
  url: string;
  viewport: Viewport;
  config: ClearA11yConfig;
  state?: string;
  stateMeta?: StateMeta;
  artifacts?: ArtifactSink;
  log?: Logger;
  recordPass?: (pass: PassInput) => void;
}): PageContext {
  return {
    page: input.page,
    url: input.url,
    viewport: input.viewport,
    config: input.config,
    state: input.state ?? 'default',
    ...(input.stateMeta ? { stateMeta: input.stateMeta } : {}),
    artifacts: input.artifacts ?? nullArtifactSink,
    log: input.log ?? silentLogger,
    ...(input.recordPass ? { recordPass: input.recordPass } : {}),
  };
}

/** Chrome DevTools Protocol session for the page (accessibility tree, input emulation). */
export function getCdpSession(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}
