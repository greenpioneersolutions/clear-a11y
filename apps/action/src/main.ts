import { appendFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, posix, relative } from 'node:path';
import * as core from '@actions/core';
import type { Logger } from '@clear-a11y/browser';
import {
  SCAN_RESULT_SCHEMA_VERSION,
  summarize,
  type ClearA11yConfigInput,
  type ScanResult,
} from '@clear-a11y/core';
import {
  allTargets,
  changedFilesFromGit,
  detectRepo,
  limitResultToFiles,
  mergeScanResults,
  targetsForChanges,
  type ChangeTargets,
} from '@clear-a11y/repo';
import { toMarkdownSummary, writeReports } from '@clear-a11y/reporter';
import { allRules, scan, scanRepo, VERSION } from '@clear-a11y/runner';
import { readEventRange, type CommitRange } from './event.js';
import { readInputs, type ActionInputs } from './inputs.js';
import { failureMessage, tierCounts, upsertPrComment } from './outputs.js';

export interface RunOptions {
  /** Environment (defaults to process.env). Inputs are read from INPUT_* by @actions/core. */
  env?: NodeJS.ProcessEnv;
  /** For the optional PR comment (tests inject a fake; never the network in tests). */
  fetch?: typeof fetch;
}

export interface RunResult {
  /** 1 when findings reach `fail-on`, else 0. */
  exitCode: number;
  failure?: string;
  result: ScanResult;
  targets: ChangeTargets;
  /** URLs scanned in the browser (pages and stories). */
  scannedUrls: string[];
  changedFiles?: string[];
  summary: string;
}

const actionsLogger: Logger = {
  debug: (m, d) => core.debug(d ? `${m} ${JSON.stringify(d)}` : m),
  info: (m, d) => core.info(d ? `${m} ${JSON.stringify(d)}` : m),
  // Runner warnings are informational; core.warning would turn each into an annotation.
  warn: (m, d) => core.info(`warning: ${d ? `${m} ${JSON.stringify(d)}` : m}`),
  error: (m, d) => core.error(d ? `${m} ${JSON.stringify(d)}` : m),
};

function emptyResult(): ScanResult {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCAN_RESULT_SCHEMA_VERSION,
    tool: { name: 'clear-a11y', version: VERSION },
    startedAt: now,
    finishedAt: now,
    targets: [],
    pages: [],
    findings: [],
    errors: [],
    summary: summarize([]),
  };
}

/** The Playwright version the action ships, so the install hint matches its browser build. */
function playwrightVersion(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    return (req('playwright-core/package.json') as { version: string }).version;
  } catch {
    return undefined;
  }
}

export function browserInstallHint(): string {
  const v = playwrightVersion();
  return `Chromium is not installed. Add a step before this action: \`npx playwright${v ? `@${v}` : ''} install --with-deps chromium\`.`;
}

const MISSING_BROWSER = /Executable doesn't exist|browserType\.launch|playwright install/i;

/** Reads storybook-static/index.json (Storybook 7+) or stories.json (older). */
async function readStoryIndex(dir: string): Promise<unknown> {
  for (const name of ['index.json', 'stories.json']) {
    try {
      return JSON.parse(await readFile(join(dir, name), 'utf-8')) as unknown;
    } catch {
      // try the next name
    }
  }
  return undefined;
}

/** Runs a browser scan, turning Playwright's "browser not installed" error into an install hint. */
async function withBrowserHint<T>(scanFn: () => Promise<T>): Promise<T> {
  try {
    return await scanFn();
  } catch (err) {
    const msg = (err as Error).message;
    throw new Error(MISSING_BROWSER.test(msg) ? `${browserInstallHint()}\n${msg}` : msg);
  }
}

/** `dir` relative to `root` in POSIX form, or undefined when it is outside `root`. */
export function repoRelativeDir(root: string, dir: string): string | undefined {
  const rel = relative(root, dir).replace(/\\/g, '/');
  if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) return undefined;
  return rel.replace(/\/+$/, '');
}

/** Shallowest folders that contain all `files` (scanRepo walks folders recursively). */
export function foldersFor(files: readonly string[]): string[] {
  const dirs = [...new Set(files.map((f) => posix.dirname(f)))].sort();
  const out: string[] = [];
  for (const d of dirs) {
    if (out.some((o) => o === '.' || d === o || d.startsWith(`${o}/`))) continue;
    out.push(d);
  }
  return out;
}

async function changedFiles(
  inputs: ActionInputs,
  env: NodeJS.ProcessEnv,
  notes: string[],
): Promise<{ files?: string[]; range?: CommitRange }> {
  if (!inputs.changedOnly) return {};
  const range =
    inputs.baseSha && inputs.headSha
      ? ({ base: inputs.baseSha, head: inputs.headSha, mode: 'merge-base' } as const)
      : await readEventRange(env);
  if ('error' in range) {
    notes.push(`${range.error} Scanned everything configured instead of only the changes.`);
    core.warning(range.error);
    return {};
  }
  const files = await changedFilesFromGit({ repoPath: inputs.repoPath, ...range });
  notes.push(
    `${files.length} changed file${files.length === 1 ? '' : 's'} between ${range.base.slice(0, 7)} and ${range.head.slice(0, 7)}.`,
  );
  return { files, range };
}

/** Runs the action. Never calls process.exit; the entry point sets the exit code. */
export async function run(options: RunOptions = {}): Promise<RunResult> {
  const env = options.env ?? process.env;
  const cwd = env['GITHUB_WORKSPACE'] || process.cwd();
  const inputs = await readInputs((name) => core.getInput(name), { cwd });
  const notes: string[] = [];

  // 1. What changed, and what that means to scan.
  const { files, range } = await changedFiles(inputs, env, notes);
  const detection = await detectRepo(inputs.repoPath);
  const storybookIndex = inputs.storybookStatic
    ? await readStoryIndex(inputs.storybookStatic)
    : undefined;
  if (inputs.storybookStatic && !storybookIndex)
    notes.push('No index.json or stories.json in storybook-static, so no stories were matched.');
  const storyRel = inputs.storybookStatic
    ? relative(inputs.repoPath, dirname(inputs.storybookStatic)).replace(/\\/g, '/')
    : '.';
  const storybookRoot =
    storyRel && !storyRel.startsWith('..') && !isAbsolute(storyRel) ? storyRel : '.';
  const repoConfig = (inputs.config.repo ?? {}) as { include?: string[]; exclude?: string[] };
  const targets = files
    ? targetsForChanges({
        changedFiles: files,
        repoPath: inputs.repoPath,
        routes: inputs.routes,
        storybookIndex,
        storybookRoot,
        nextjs: detection.frameworks.includes('next'),
        ...(inputs.baseUrl ? { baseUrl: inputs.baseUrl } : {}),
        defaultTargets: inputs.defaultTargets,
        sourceDirs: repoConfig.include ?? detection.sourceDirs,
        ...(repoConfig.exclude ? { exclude: repoConfig.exclude } : {}),
      })
    : allTargets({
        routes: inputs.routes,
        storybookIndex,
        ...(inputs.baseUrl ? { baseUrl: inputs.baseUrl } : {}),
        defaultTargets: inputs.defaultTargets,
      });
  notes.push(...targets.notes);

  // 2. Browser scan of the routes' pages.
  const pageUrls = targets.routes.flatMap((t) => (t.url ? [t.url] : []));
  if (targets.routes.length && !inputs.baseUrl)
    notes.push(
      `${targets.routes.length} route(s) matched, but no base-url is set, so no pages were scanned.`,
    );
  const crawlSite = !files && !targets.routes.length && !!inputs.baseUrl;
  if (crawlSite) pageUrls.push(inputs.baseUrl as string);

  const results: ScanResult[] = [];
  const scannedUrls: string[] = [];
  const urls = pageUrls.slice(0, inputs.maxPages);
  if (pageUrls.length > urls.length)
    notes.push(`Scanned the first ${urls.length} of ${pageUrls.length} pages (max-pages).`);
  if (urls.length) {
    const config: ClearA11yConfigInput = {
      ...inputs.config,
      targets: [],
      crawl: {
        ...inputs.config.crawl,
        enabled: crawlSite,
        ...(crawlSite ? { maxPages: inputs.maxPages } : {}),
      },
    };
    if (crawlSite)
      notes.push(`Crawled ${inputs.baseUrl} (up to ${inputs.maxPages} same-origin pages).`);
    core.info(`Scanning ${urls.length} page(s) in Chromium`);
    results.push(
      await withBrowserHint(() =>
        scan({ targets: urls, config, outDir: inputs.outDir, log: actionsLogger }),
      ),
    );
    scannedUrls.push(...urls);
  }

  // 3. One repo scan: the matched stories through the runner's Storybook layer (so story findings
  //    are mapped to source files and reach code scanning) and the static lint of changed files.
  const storyDir = inputs.storybookStatic
    ? repoRelativeDir(inputs.repoPath, inputs.storybookStatic)
    : undefined;
  if (targets.stories.length && inputs.storybookStatic && !storyDir)
    notes.push('storybook-static is outside repo-path, so no stories were scanned.');
  const storyIds = storyDir ? targets.stories.map((s) => s.id) : [];
  const stories = storyIds.slice(0, Math.max(0, inputs.maxPages - urls.length));
  if (storyIds.length > stories.length)
    notes.push(
      `Scanned ${stories.length} of ${storyIds.length} matched stories (max-pages counts pages and stories together).`,
    );
  const lint = !files || targets.sourceFiles.length > 0;
  if (lint || stories.length) {
    if (stories.length) core.info(`Scanning ${stories.length} story(ies) in Chromium`);
    const repo = await withBrowserHint(() =>
      scanRepo({
        path: inputs.repoPath,
        config: inputs.config,
        repo: {
          // Changed files only: lint their folders (then keep only their findings below).
          ...(files ? { include: foldersFor(targets.sourceFiles) } : {}),
          ...(stories.length
            ? {
                runtime: true,
                storybookStatic: storyDir,
                storybookUrl: undefined,
                boot: false,
                maxStories: stories.length,
                // Story ids are globs that match only themselves (Storybook ids are [a-z0-9-]).
                ...(files ? { storyFilter: stories } : {}),
              }
            : { runtime: false }),
        },
        outDir: inputs.outDir,
        toolVersion: VERSION,
        log: actionsLogger,
      }),
    );
    const origin = repo.runtime.mode === 'storybook' ? repo.runtime.origin : undefined;
    const isStory = (url: string) => !!origin && url.startsWith(origin);
    results.push(
      files
        ? limitResultToFiles(repo.result, targets.sourceFiles, { keepUrl: isStory })
        : repo.result,
    );
    scannedUrls.push(...new Set(repo.result.pages.map((p) => p.url).filter(isStory)));
    if (lint)
      notes.push(
        files
          ? `Linted ${targets.sourceFiles.length} changed source file${targets.sourceFiles.length === 1 ? '' : 's'}.`
          : 'Linted the whole repo (not limited to changes).',
      );
    if (repo.runtime.stories)
      notes.push(
        `Scanned ${repo.runtime.stories} stor${repo.runtime.stories === 1 ? 'y' : 'ies'} from ${storyDir}; their findings point at the story or component source.`,
      );
  }

  // 4. Reports, summary, outputs.
  const result = results.length ? mergeScanResults(results) : emptyResult();
  const written = await writeReports(result, inputs.outDir, inputs.formats, {
    rules: allRules(),
    repoRoot: inputs.repoPath,
  });
  const pathOf = (format: string) => written.find((w) => w.format === format)?.path ?? '';
  const htmlNote = pathOf('html')
    ? `Full report: report.html in the "${inputs.artifactName}" artifact of this run (when the workflow uploads ${relative(cwd, inputs.outDir) || '.'} with actions/upload-artifact).`
    : undefined;
  const summary = toMarkdownSummary(result, {
    maxFindings: 50,
    notes,
    ...(htmlNote ? { reportNote: htmlNote } : {}),
  });
  // Appended directly (core.summary caches the file path for the life of the process).
  const summaryFile = env['GITHUB_STEP_SUMMARY'];
  if (summaryFile) await appendFile(summaryFile, `${summary}\n`);
  else core.info(summary);

  const counts = tierCounts(result);
  core.setOutput('violations', counts.violation);
  core.setOutput('likely', counts.likely);
  core.setOutput('needs-review', counts['needs-review']);
  core.setOutput('sarif-path', pathOf('sarif'));
  core.setOutput('report-path', pathOf('html'));
  core.setOutput('json-path', pathOf('json'));
  core.setOutput('scanned-targets', JSON.stringify(scannedUrls));
  core.setOutput('changed-files', files ? String(files.length) : '');

  if (inputs.comment) {
    if (!inputs.githubToken) core.warning('comment is true but no github-token was given.');
    else if (!range?.pullRequest)
      core.warning('comment is true but this run is not for a pull request.');
    else
      await upsertPrComment({
        token: inputs.githubToken,
        repository: env['GITHUB_REPOSITORY'] ?? '',
        pullRequest: range.pullRequest,
        body: summary,
        ...(env['GITHUB_API_URL'] ? { apiUrl: env['GITHUB_API_URL'] } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }).then(
        (how) => core.info(`PR comment ${how}.`),
        (err: Error) =>
          core.warning(
            `Could not write the PR comment (${err.message}). It needs \`pull-requests: write\`; pull requests from forks only get a read-only token.`,
          ),
      );
  }

  const failure = failureMessage(result, inputs.failOn);
  return {
    exitCode: failure ? 1 : 0,
    ...(failure ? { failure } : {}),
    result,
    targets,
    scannedUrls,
    ...(files ? { changedFiles: files } : {}),
    summary,
  };
}
