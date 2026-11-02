import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  gotoAndSettle,
  silentLogger,
  startStaticServer,
  type Logger,
  type Page,
  type StaticServer,
} from '@clear-a11y/browser';
import {
  findingId,
  resolveConfig,
  summarize,
  type ClearA11yConfig,
  type Finding,
  type ResolvedFinding,
  type ScanError,
  type ScannedPage,
} from '@clear-a11y/core';
import { browserLinkSource, crawl } from '@clear-a11y/crawler';
import {
  assertLocalStorybookUrl,
  chooseRuntime,
  fetchStoryIndex,
  mapFindingsToSource,
  planDevServer,
  reactDebugSourceProbe,
  readStaticStoryIndex,
  repoTarget,
  resolveRepoConfig,
  resolveStoryFile,
  scanRepo as scanRepoStatic,
  selectStories,
  sourceAttributesProbe,
  startDevServer,
  storybookProjectDirs,
  storyExportLine,
  storyIframeUrl,
  type FetchLike,
  type RepoConfig,
  type RepoConfigInput,
  type RepoDetection,
  type RepoScanResult,
  type ScanRepoOptions,
  type SourceHints,
  type StartDevServerOptions,
  type StorybookSource,
  type StoryIndexEntry,
} from '@clear-a11y/repo';
import { finalizeFindings } from './dedupe.js';
import {
  createScanner,
  VERSION,
  type PageScanResult,
  type Scanner,
  type ScannerOptions,
} from './scan.js';

/** Engine name on scan errors from the runtime layer (Storybook, dev server). */
export const REPO_RUNTIME_ENGINE = 'repo-runtime';

export interface RepoScanOptions
  extends
    Omit<ScanRepoOptions, 'log'>,
    Pick<ScannerOptions, 'outDir' | 'only' | 'engines' | 'session' | 'artifacts' | 'states'> {
  log?: Logger;
  /** Test hooks for the dev-server layer. */
  devServer?: Pick<StartDevServerOptions, 'spawn' | 'onSpawn'>;
  /** Test hook for reading a running Storybook's index. */
  fetch?: FetchLike;
}

export interface RepoRuntimeSummary {
  mode: 'storybook' | 'dev-server' | 'none';
  /** Where runtime pages came from: `repo:storybook-static/`, a Storybook URL or the dev server URL. */
  origin?: string;
  /** Stories scanned (Storybook mode). */
  stories?: number;
  /** Runtime pages scanned (stories or crawled pages). */
  pages: number;
  /** Runtime findings after dedupe. */
  findings: number;
  /** Why runtime scanning did not run (mode "none"), or how to enable it. */
  reason?: string;
  /** Informational notes (monorepo choice, port handling, Storybook preferred over --boot). */
  notes: string[];
}

export interface FullRepoScanResult extends RepoScanResult {
  runtime: RepoRuntimeSummary;
}

interface RuntimeOutput extends PageScanResult {
  notices: string[];
  targets: string[];
}

/** Waits until a Storybook story rendered into #storybook-root (or shows Storybook's error display). */
export async function waitForStory(page: Page, timeoutMs = 10_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#storybook-root') ?? document.querySelector('#root');
      return (
        document.body.classList.contains('sb-show-errordisplay') ||
        (!!root && root.childElementCount > 0)
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
}

/** Same finding with a different page URL (and the stable id recomputed for it). */
function withPageUrl(f: Finding, url: string): Finding {
  if (url === f.page.url) return f;
  const moved = { ...f, page: { ...f.page, url } };
  return { ...moved, id: findingId(moved) };
}

/**
 * Reads source hints (Clear A11Y source attributes on the element or an ancestor, React debug
 * info) from a fresh copy of the page (default state), for findings that have no source yet.
 */
async function collectSourceHints(
  scanner: Scanner,
  url: string,
  findings: readonly Finding[],
  prepare?: (page: Page) => Promise<void>,
): Promise<Map<string, SourceHints>> {
  const hints = new Map<string, SourceHints>();
  const selectors = [
    ...new Set(
      // Elements of other states (an open dialog) usually exist, hidden, in the default page too.
      findings.filter((f) => !f.source).map((f) => f.target.selector),
    ),
  ].slice(0, 50);
  const viewport = scanner.config.viewports[0];
  if (!selectors.length || !viewport) return hints;
  const opened = await scanner.session.newPage(viewport);
  try {
    await gotoAndSettle(opened.page, url, scanner.config.timeoutMs);
    if (prepare) await prepare(opened.page).catch(() => undefined);
    for (const selector of selectors) {
      const el = opened.page.locator(selector).first();
      const attributes = await el
        .evaluate(sourceAttributesProbe, undefined, { timeout: 1_000 })
        .catch(() => null);
      const react = await el
        .evaluate(reactDebugSourceProbe, undefined, { timeout: 1_000 })
        .catch(() => null);
      if (attributes || react) hints.set(selector, { attributes, react });
    }
  } catch {
    /* hints are best effort */
  } finally {
    await opened.close().catch(() => undefined);
  }
  return hints;
}

/** Runtime findings -> source: attributes / React debug info / literal search (S09). */
async function mapToSource(
  root: string,
  scanner: Scanner,
  url: string,
  findings: readonly Finding[],
  prepare?: (page: Page) => Promise<void>,
): Promise<Finding[]> {
  if (!findings.length) return [];
  const hints = await collectSourceHints(scanner, url, findings, prepare);
  return mapFindingsToSource(findings, root, { hints: (f) => hints.get(f.target.selector) });
}

interface Context {
  root: string;
  options: RepoScanOptions;
  config: ClearA11yConfig;
  repoConfig: RepoConfig;
  detection: RepoDetection;
  log: Logger;
  out: RuntimeOutput;
  summary: RepoRuntimeSummary;
}

const scannerOptions = (ctx: Context, extra: Partial<ScannerOptions> = {}): ScannerOptions => ({
  config: ctx.options.config,
  outDir: ctx.options.outDir,
  only: ctx.options.only,
  engines: ctx.options.engines,
  session: ctx.options.session,
  artifacts: ctx.options.artifacts,
  states: ctx.options.states,
  log: ctx.log,
  ...extra,
});

/** Gives story findings without a mapped location the story file (and the story's export line). */
async function storyFallback(
  ctx: Context,
  story: StoryIndexEntry,
  source: StorybookSource,
): Promise<(f: Finding) => Finding> {
  const file = await resolveStoryFile(
    ctx.root,
    story.importPath,
    storybookProjectDirs(ctx.detection, source),
  );
  if (!file) return (f) => f;
  const text = await readFile(join(ctx.root, file), 'utf-8').catch(() => '');
  const line = storyExportLine(text, story.name) ?? 1;
  return (f) =>
    f.source
      ? f
      : {
          ...f,
          source: { file, line, component: story.title },
          evidence: {
            ...f.evidence,
            data: {
              ...f.evidence.data,
              sourceMatch: { strategy: 'story-file', confidence: 0.5, story: story.id },
            },
          },
        };
}

async function scanStorybook(ctx: Context, source: StorybookSource): Promise<void> {
  const { root, repoConfig, out, summary, log } = ctx;
  const index =
    source.kind === 'static'
      ? await readStaticStoryIndex(root, source.dir)
      : await fetchStoryIndex(source.url, { fetch: ctx.options.fetch });
  const selection = selectStories(index.entries, {
    filter: repoConfig.storyFilter,
    max: repoConfig.maxStories,
  });
  if (index.invalid)
    out.notices.push(
      `${index.invalid} Storybook index entries were not understood and were skipped.`,
    );
  if (selection.truncated)
    out.notices.push(
      `Scanned the first ${selection.stories.length} of ${selection.stories.length + selection.truncated} stories (repo.maxStories); raise it or narrow repo.storyFilter.`,
    );
  if (!selection.stories.length) {
    out.notices.push('The Storybook index has no stories to scan (after repo.storyFilter).');
    return;
  }

  let server: StaticServer | undefined;
  let base: string;
  if (source.kind === 'static') {
    server = await startStaticServer({ root: join(root, source.dir) });
    base = server.url('/');
  } else base = assertLocalStorybookUrl(source.url);
  // A built Storybook is served on a random port: report its pages repo-relative so finding ids
  // stay stable across runs (repo:storybook-static/iframe.html?id=...).
  const stableBase = source.kind === 'static' ? `repo:${source.dir.replace(/\/+$/, '')}/` : base;
  const rebase = (url: string) =>
    url.startsWith(base) ? stableBase + url.slice(base.length) : url;
  summary.origin = stableBase;
  out.targets.push(stableBase);

  const failedToRender = new Set<string>();
  const prepare = async (page: Page) => {
    await waitForStory(page, Math.min(ctx.config.timeoutMs, 10_000));
    if (await page.evaluate(() => document.body.classList.contains('sb-show-errordisplay')))
      failedToRender.add(page.url());
  };
  const deadline = Date.now() + repoConfig.runtimeTimeoutMs;
  let scanner: Scanner | undefined;
  try {
    scanner = await createScanner(scannerOptions(ctx, { prepare }));
    let scanned = 0;
    for (const story of selection.stories) {
      if (Date.now() > deadline) {
        out.notices.push(
          `Runtime time budget used up (repo.runtimeTimeoutMs): ${selection.stories.length - scanned} stories were not scanned.`,
        );
        break;
      }
      const url = storyIframeUrl(base, story.id);
      log.info(`scanning story ${story.id}`);
      const r = await scanner.scanUrl(url);
      scanned++;
      const fallback = await storyFallback(ctx, story, source);
      const mapped = (await mapToSource(root, scanner, url, r.findings, prepare)).map(fallback);
      out.findings.push(...mapped.map((f) => withPageUrl(f, rebase(f.page.url))));
      out.pages.push(...r.pages.map((p): ScannedPage => ({ ...p, url: rebase(p.url) })));
      out.errors.push(...r.errors.map((e): ScanError => ({ ...e, url: rebase(e.url) })));
      out.resolved?.push(
        ...(r.resolved ?? []).map((x): ResolvedFinding => ({
          finding: withPageUrl(x.finding, rebase(x.finding.page.url)),
          resolvedBy: {
            ...x.resolvedBy,
            page: { ...x.resolvedBy.page, url: rebase(x.resolvedBy.page.url) },
          },
        })),
      );
      if (failedToRender.has(url))
        out.errors.push({
          url: rebase(url),
          state: 'default',
          viewport: ctx.config.viewports[0]?.name ?? 'desktop',
          engine: REPO_RUNTIME_ENGINE,
          message: `story "${story.title} / ${story.name}" did not render (Storybook error display)`,
        });
    }
    summary.stories = scanned;
  } finally {
    await scanner?.close();
    await server?.close();
  }
}

async function scanDevServer(ctx: Context): Promise<void> {
  const { root, repoConfig, out, summary, log, config } = ctx;
  const plan = await planDevServer(root, ctx.detection, { script: repoConfig.bootScript });
  summary.notes.push(...plan.notes);
  const server = await startDevServer(root, plan, {
    timeoutMs: repoConfig.bootTimeoutMs,
    log,
    ...ctx.options.devServer,
  });
  let scanner: Scanner | undefined;
  try {
    summary.origin = server.url;
    out.targets.push(server.url);
    scanner = await createScanner(scannerOptions(ctx));
    const urls = await crawl(
      {
        start: [server.url],
        maxPages: config.crawl.maxPages,
        sameOrigin: true,
        include: config.crawl.include,
        exclude: config.crawl.exclude,
      },
      browserLinkSource(scanner.session, config.timeoutMs),
    );
    const deadline = Date.now() + repoConfig.runtimeTimeoutMs;
    for (const [i, url] of urls.entries()) {
      if (Date.now() > deadline) {
        out.notices.push(
          `Runtime time budget used up (repo.runtimeTimeoutMs): ${urls.length - i} pages were not scanned.`,
        );
        break;
      }
      log.info(`scanning ${url}`);
      const r = await scanner.scanUrl(url);
      out.findings.push(...(await mapToSource(root, scanner, url, r.findings)));
      out.pages.push(...r.pages);
      out.errors.push(...r.errors);
      out.resolved?.push(...(r.resolved ?? []));
    }
  } finally {
    await scanner?.close().catch(() => undefined);
    // Always end the dev server's whole process tree, also after errors and timeouts.
    await server.stop();
  }
}

/**
 * Scans a source repo with every layer that applies: static lint (S09), then the runtime layer.
 * Runtime is a built Storybook (or a running local one via `repo.storybookUrl`), each story
 * scanned with the full engine set; or, only when the user opted in with `repo.boot`, the app's
 * dev server started from its package.json and crawled like a site. Returns one ScanResult.
 */
export async function scanRepo(options: RepoScanOptions): Promise<FullRepoScanResult> {
  const log = options.log ?? silentLogger;
  const root = resolve(options.path);
  const staticScan = await scanRepoStatic({
    ...options,
    toolVersion: options.toolVersion ?? VERSION,
    log,
  });
  const repoConfig = resolveRepoConfig({
    ...((options.config?.repo as RepoConfigInput | undefined) ?? {}),
    ...options.repo,
  });
  const plan = chooseRuntime(staticScan.detection, repoConfig);
  const out: RuntimeOutput = {
    findings: [],
    pages: [],
    errors: [],
    resolved: [],
    notices: [],
    targets: [],
  };
  const summary: RepoRuntimeSummary = {
    mode: plan.mode,
    pages: 0,
    findings: 0,
    notes: plan.mode === 'none' ? [] : [...plan.notes],
    ...(plan.mode === 'none' ? { reason: plan.reason } : {}),
  };
  const ctx: Context = {
    root,
    options,
    config: resolveConfig(options.config),
    repoConfig,
    detection: staticScan.detection,
    log,
    out,
    summary,
  };
  try {
    if (plan.mode === 'storybook') await scanStorybook(ctx, plan.source);
    else if (plan.mode === 'dev-server') await scanDevServer(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('runtime layer failed', { message });
    out.notices.push(message);
  }
  for (const n of out.notices) log.warn(n);

  const runtimeFindings = finalizeFindings(out.findings);
  summary.pages = new Set(out.pages.map((p) => p.url)).size;
  summary.findings = runtimeFindings.length;
  const findings = finalizeFindings([...staticScan.result.findings, ...runtimeFindings]);
  const target = repoTarget(root);
  return {
    detection: staticScan.detection,
    notices: [...staticScan.notices, ...out.notices],
    runtime: summary,
    result: {
      ...staticScan.result,
      finishedAt: new Date().toISOString(),
      targets: [...staticScan.result.targets, ...out.targets],
      pages: [...staticScan.result.pages, ...out.pages],
      findings,
      errors: [
        ...staticScan.result.errors,
        ...out.errors,
        ...out.notices.map((message): ScanError => ({
          url: target,
          state: 'runtime',
          viewport: 'none',
          engine: REPO_RUNTIME_ENGINE,
          message,
        })),
      ],
      summary: summarize(findings, out.resolved),
      resolved: out.resolved ?? [],
    },
  };
}
