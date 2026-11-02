import { createRequire } from 'node:module';
import {
  createPageContext,
  fileArtifactSink,
  gotoAndSettle,
  launchBrowser,
  nullArtifactSink,
  silentLogger,
  type ArtifactSink,
  type BrowserSession,
  type OpenedPage,
  type Engine,
  type PageContext,
  type Logger,
  type Page,
} from '@clear-a11y/browser';
import {
  PassRecordSchema,
  resolveConfig,
  resolveWithPasses,
  summarize,
  SCAN_RESULT_SCHEMA_VERSION,
  type ClearA11yConfig,
  type ClearA11yConfigInput,
  type Finding,
  type PassRecord,
  type ResolvedFinding,
  type ScanError,
  type ScannedPage,
  type ScanResult,
  type Viewport,
} from '@clear-a11y/core';
import { browserLinkSource, crawl } from '@clear-a11y/crawler';
import { dropStateDuplicates, finalizeFindings } from './dedupe.js';
import { createEngines } from './engines.js';
import { ENGINE_NAME as STATES_ENGINE } from '@clear-a11y/engine-states';
import { exploreStates, noStates, type DiscoveredState, type StateDiscoverer } from './states.js';
import { withTimeout } from './timeout.js';

export const VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;

export interface ScannerOptions {
  config?: ClearA11yConfigInput;
  /** Explicit engines (tests). Defaults to the registry filtered by config. */
  engines?: Engine[];
  /** Limit to these engine keys, e.g. ["static"] for the axe-only baseline. */
  only?: readonly string[];
  /** Report directory: screenshot crops are written to `<outDir>/artifacts`. */
  outDir?: string;
  artifacts?: ArtifactSink;
  log?: Logger;
  /** Reuse an existing browser session (it is not closed by the scanner). */
  session?: BrowserSession;
  /**
   * Finds the hidden states (menus, dialogs, form errors) every engine also scans. Defaults to
   * engine-states' explorer when the `states` engine is enabled, otherwise no states.
   */
  discoverStates?: StateDiscoverer;
  /** Set to false to scan only the default state of each page. */
  states?: boolean;
  /**
   * Runs after every navigation, before states are replayed and engines run: waits for content that
   * renders late (a Storybook story inside #storybook-root). Errors are ignored.
   */
  prepare?: (page: Page) => Promise<void>;
}

export interface PageScanResult {
  findings: Finding[];
  pages: ScannedPage[];
  errors: ScanError[];
  /** Verified passes recorded by deterministic engines (ADR 0003). */
  passes?: PassRecord[];
  /** `needs-review` findings dropped because a pass settled them (ADR 0003). */
  resolved?: ResolvedFinding[];
}

export interface Scanner {
  config: ClearA11yConfig;
  session: BrowserSession;
  engines: Engine[];
  scanUrl(url: string): Promise<PageScanResult>;
  close(): Promise<void>;
}

const DEFAULT_STATE: DiscoveredState = { id: 'default', meta: { kind: 'default' } };

export async function createScanner(options: ScannerOptions = {}): Promise<Scanner> {
  const config = resolveConfig(options.config);
  const log = options.log ?? silentLogger;
  const engines = options.engines ?? createEngines(config, options.only);
  const artifacts =
    options.artifacts ??
    (options.outDir && config.output.screenshots
      ? fileArtifactSink(options.outDir)
      : nullArtifactSink);
  const statesEnabled =
    options.states !== false &&
    (options.only?.length ? options.only.includes('states') : config.engines.states !== false);
  const discover = !statesEnabled ? noStates : (options.discoverStates ?? exploreStates);
  const ownSession = !options.session;
  const session =
    options.session ?? (await launchBrowser({ storageState: config.auth.storageState }));
  const readOnly = engines.filter((e) => e.mutatesPage === false);
  const mutating = engines.filter((e) => e.mutatesPage !== false);

  async function open(url: string, viewport: Viewport, state?: DiscoveredState) {
    const opened = await session.newPage(viewport);
    try {
      await gotoAndSettle(opened.page, url, config.timeoutMs);
      if (options.prepare) await options.prepare(opened.page).catch(() => undefined);
      if (state?.meta.replay) await state.meta.replay(opened.page);
      if (state?.verify && !(await state.verify(opened.page))) {
        throw new Error('state did not verify after replay');
      }
    } catch (err) {
      await opened.close();
      throw err;
    }
    return opened;
  }

  async function runEngine(
    engine: Engine,
    makeCtx: (recordPass: NonNullable<PageContext['recordPass']>) => PageContext,
    out: PageScanResult,
  ) {
    // Passes are tagged with the engine the runner called, so an engine can't speak for another.
    // Passes arriving after the engine settled (it timed out and kept running) are ignored.
    let open = true;
    const ctx = makeCtx((pass) => {
      if (!open) return;
      const record = PassRecordSchema.safeParse({
        ...pass,
        engine: engine.name,
        page: { url: ctx.url, state: ctx.state, viewport: ctx.viewport.name },
      });
      if (record.success) (out.passes ??= []).push(record.data);
      else log.debug(`${engine.name}: invalid pass record ignored`, { pass });
    });
    try {
      out.findings.push(...(await withTimeout(engine.run(ctx), config.timeoutMs, engine.name)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`${engine.name} failed`, { url: ctx.url, state: ctx.state, message });
      out.errors.push({
        url: ctx.url,
        state: ctx.state,
        viewport: ctx.viewport.name,
        engine: engine.name,
        message,
      });
    } finally {
      open = false;
    }
  }

  async function scanViewport(url: string, viewport: Viewport, out: PageScanResult) {
    const page: ScannedPage = { url, viewport: viewport.name, states: [] };
    out.pages.push(page);
    const base = await open(url, viewport).catch((err: unknown) => {
      page.error = err instanceof Error ? err.message : String(err);
      return undefined;
    });
    if (!base) return;
    const ctxFor =
      (p: typeof base.page, state: DiscoveredState) => (recordPass?: PageContext['recordPass']) =>
        createPageContext({
          page: p,
          url,
          viewport,
          config,
          state: state.id,
          stateMeta: state.meta,
          artifacts,
          log,
          ...(recordPass ? { recordPass } : {}),
        });

    let states: DiscoveredState[] = [DEFAULT_STATE];
    page.title = await base.page.title().catch(() => '');
    if (discover !== noStates) {
      // Discovery clicks, hovers and submits: give it its own page so the default state stays
      // pristine (no leftover hover, focus, route guard or submitted values).
      let explorer: OpenedPage | undefined;
      try {
        explorer = await open(url, viewport);
        states = [
          DEFAULT_STATE,
          ...(await withTimeout(
            discover(ctxFor(explorer.page, DEFAULT_STATE)()),
            config.timeoutMs,
            'state discovery',
          )),
        ];
      } catch (err) {
        out.errors.push({
          url,
          state: 'default',
          viewport: viewport.name,
          engine: 'state-discovery',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await explorer?.close().catch(() => undefined);
      }
    }

    for (const state of states) {
      const isDefault = state === DEFAULT_STATE;
      let replayError = '';
      const shared: OpenedPage | undefined = isDefault
        ? base
        : await open(url, viewport, state).catch((err: unknown) => {
            replayError = err instanceof Error ? err.message : String(err);
            return undefined;
          });
      if (!shared) {
        log.warn('skipping state', { url, state: state.id, message: replayError });
        out.errors.push({
          url,
          state: state.id,
          viewport: viewport.name,
          engine: 'runner',
          message: `could not replay state: ${replayError}`,
        });
        continue;
      }
      page.states.push(state.id);
      // States are explored from the default page only; the explorer itself skips replayed states.
      const applies = (e: Engine) => isDefault || e.name !== STATES_ENGINE;
      for (const engine of readOnly.filter(applies)) {
        await runEngine(engine, ctxFor(shared.page, state), out);
      }
      if (shared !== base) await shared.close();
      for (const engine of mutating.filter(applies)) {
        const fresh = await open(url, viewport, isDefault ? undefined : state).catch(
          () => undefined,
        );
        if (!fresh) continue;
        await runEngine(engine, ctxFor(fresh.page, state), out);
        await fresh.close();
      }
    }
    await base.close();
  }

  return {
    config,
    session,
    engines,
    async scanUrl(url) {
      const out: PageScanResult = { findings: [], pages: [], errors: [], passes: [] };
      for (const viewport of config.viewports) await scanViewport(url, viewport, out);
      const passes = out.passes ?? [];
      const { findings, resolved } = resolveWithPasses(dropStateDuplicates(out.findings), passes);
      return { ...out, passes, resolved, findings: finalizeFindings(findings) };
    },
    async close() {
      if (ownSession) await session.close();
    },
  };
}

export interface ScanProgress {
  /** Pages finished so far. */
  done: number;
  /** Pages to scan (known after crawling). */
  total: number;
  /** The page about to be scanned; absent on the final call. */
  url?: string;
}

export interface ScanOptions extends ScannerOptions {
  targets: readonly string[];
  /** Called before each page and once at the end. Errors thrown here are ignored. */
  onProgress?: (progress: ScanProgress) => void;
  /** Stops the scan between pages (the page in progress finishes); `scan` then rejects. */
  signal?: AbortSignal;
}

/** Scans the targets (and, when `config.crawl.enabled`, same-origin pages linked from them). */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const scanner = await createScanner(options);
  const { config } = scanner;
  const targets = [...options.targets, ...config.targets];
  try {
    const urls = config.crawl.enabled
      ? await crawl(
          { start: targets, ...config.crawl },
          browserLinkSource(scanner.session, config.timeoutMs),
        )
      : targets;
    const all: PageScanResult = { findings: [], pages: [], errors: [] };
    const resolved: ResolvedFinding[] = [];
    const progress = (p: ScanProgress) => {
      try {
        options.onProgress?.(p);
      } catch {
        // A progress observer must not break the scan.
      }
    };
    for (const [i, url] of urls.entries()) {
      options.signal?.throwIfAborted();
      progress({ done: i, total: urls.length, url });
      (options.log ?? silentLogger).info(`scanning ${url}`);
      const r = await scanner.scanUrl(url);
      all.findings.push(...r.findings);
      all.pages.push(...r.pages);
      all.errors.push(...r.errors);
      resolved.push(...(r.resolved ?? []));
    }
    progress({ done: urls.length, total: urls.length });
    const findings = finalizeFindings(all.findings);
    return {
      schemaVersion: SCAN_RESULT_SCHEMA_VERSION,
      tool: { name: 'clear-a11y', version: VERSION },
      startedAt,
      finishedAt: new Date().toISOString(),
      targets,
      pages: all.pages,
      findings,
      errors: all.errors,
      summary: summarize(findings, resolved),
      resolved,
    };
  } finally {
    await scanner.close();
  }
}
