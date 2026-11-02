import { resolveConfig, type ClearA11yConfigInput, type Viewport } from '@clear-a11y/core';
import {
  createPageContext,
  gotoAndSettle,
  launchBrowser,
  memoryArtifactSink,
  startStaticServer,
  VIEWPORTS,
  type BrowserSession,
  type Page,
  type PageContext,
  type StateMeta,
  type StaticServer,
} from '@clear-a11y/browser';
import { fixturesSiteDir } from './paths.js';

/** Serves fixtures/site on localhost. */
export function startFixtureServer(port?: number): Promise<StaticServer> {
  return startStaticServer({ root: fixturesSiteDir(), port });
}

export interface OpenFixtureOptions {
  viewport?: Viewport;
  config?: ClearA11yConfigInput;
  state?: string;
  stateMeta?: StateMeta;
}

export interface OpenedFixture {
  ctx: PageContext;
  page: Page;
  url: string;
  artifacts: ReturnType<typeof memoryArtifactSink>;
  close(): Promise<void>;
}

/**
 * A browser + fixture server shared by the tests in one file. Use in beforeAll/afterAll:
 *
 *   const harness = fixtureHarness();
 *   afterAll(() => harness.close());
 *   const fx = await harness.open('keyboard/trap.html');
 */
export function fixtureHarness() {
  let session: Promise<BrowserSession> | undefined;
  let server: Promise<StaticServer> | undefined;
  const opened: OpenedFixture[] = [];
  return {
    async open(path: string, options: OpenFixtureOptions = {}): Promise<OpenedFixture> {
      session ??= launchBrowser();
      server ??= startFixtureServer();
      const viewport = options.viewport ?? VIEWPORTS.desktop;
      const { page, close } = await (await session).newPage(viewport);
      const url = (await server).url(path);
      await gotoAndSettle(page, url);
      if (options.stateMeta?.replay) await options.stateMeta.replay(page);
      const artifacts = memoryArtifactSink();
      const ctx = createPageContext({
        page,
        url,
        viewport,
        config: resolveConfig(options.config),
        state: options.state,
        stateMeta: options.stateMeta,
        artifacts,
      });
      const fixture = { ctx, page, url, artifacts, close };
      opened.push(fixture);
      return fixture;
    },
    /** Base URL of the fixture server (starts it if needed). */
    async baseUrl(): Promise<string> {
      server ??= startFixtureServer();
      return (await server).url('/');
    },
    async close(): Promise<void> {
      await Promise.allSettled(opened.map((f) => f.close()));
      if (session) await (await session).close();
      if (server) await (await server).close();
    },
  };
}

/** Opens one fixture page with its own browser; `close()` tears everything down. */
export async function openFixture(
  path: string,
  options: OpenFixtureOptions = {},
): Promise<OpenedFixture> {
  const harness = fixtureHarness();
  const fixture = await harness.open(path, options);
  return { ...fixture, close: () => harness.close() };
}
