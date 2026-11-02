import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import {
  SCAN_RESULT_SCHEMA_VERSION,
  summarize,
  type ClearA11yConfigInput,
  type Finding,
  type ScanError,
  type ScannedPage,
  type ScanResult,
} from '@clear-a11y/core';
import { resolveRepoConfig, type RepoConfigInput } from './config.js';
import { detectRepo, type RepoDetection } from './detect/detect-repo.js';
import { lintRepo, type LintRepoOptions } from './static/lint.js';
import { REPO_ESLINT_ENGINE, repoPageUrl, toFindings } from './static/to-finding.js';

const PACKAGE_VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;

/** Minimal logger (structurally compatible with @clear-a11y/browser's Logger). */
export interface RepoLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

export interface ScanRepoOptions {
  /** Path to the repo (absolute or relative to the working directory). */
  path: string;
  /** Full Clear A11Y config; only `repo` (see RepoConfigSchema) is read by the static layer. */
  config?: ClearA11yConfigInput;
  /** Shortcut that overrides `config.repo`. */
  repo?: RepoConfigInput;
  /** Reported as `result.tool.version` (the CLI passes its own version). */
  toolVersion?: string;
  log?: RepoLogger;
  /** Test hooks for the lint layer. */
  lint?: LintRepoOptions;
}

/** A scan of a source repo: the canonical ScanResult plus what we learned about the repo. */
export interface RepoScanResult {
  /** A normal ScanResult (targets: ["repo:<absolute path>"]), so every reporter works unchanged. */
  result: ScanResult;
  detection: RepoDetection;
  /** Coverage gaps and limits the user should know about (also listed in `result.errors`). */
  notices: string[];
}

/** `repo:<absolute path>`: the scan target for a source repo. */
export const repoTarget = (absPath: string): string => `repo:${absPath}`;

/**
 * Scans a source repo with the static layer: detects frameworks, lints source files with our own
 * accessibility rule config and normalizes the results into Findings. It reads files only; it never
 * runs the repo's code, scripts or config (see docs/repo-scanning.md).
 *
 * Extension point (S10): the runtime layer (Storybook stories, dev server) adds its findings,
 * pages and errors to the same ScanResult, after mapping them with `mapFindingsToSource`.
 */
export async function scanRepo(options: ScanRepoOptions): Promise<RepoScanResult> {
  const startedAt = new Date().toISOString();
  const root = resolve(options.path);
  const info = await stat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`Not a directory: ${options.path}`);
  const config = resolveRepoConfig({
    ...((options.config?.repo as RepoConfigInput | undefined) ?? {}),
    ...options.repo,
  });
  const target = repoTarget(root);

  const detection = await detectRepo(root);
  options.log?.info('repo detected', {
    frameworks: detection.frameworks,
    linters: detection.linters,
    sourceDirs: config.include ?? detection.sourceDirs,
  });
  const lint = await lintRepo(root, detection, config, options.lint);
  const findings: Finding[] = toFindings(lint.messages);

  const notices = [...lint.notices];
  if (!lint.files.length)
    notices.push(
      `No source files found to lint in ${(config.include ?? detection.sourceDirs).join(', ') || 'the repo'}.`,
    );
  for (const n of notices) options.log?.warn(n);

  const pages: ScannedPage[] = lint.files.map((file) => ({
    url: repoPageUrl(file),
    viewport: 'none',
    states: ['source'],
  }));
  const errors: ScanError[] = [
    ...lint.errors.map((e) => ({
      url: repoPageUrl(e.file),
      state: 'source',
      viewport: 'none',
      engine: REPO_ESLINT_ENGINE,
      message: `could not parse: ${e.message}`,
    })),
    ...notices.map((message) => ({
      url: target,
      state: 'source',
      viewport: 'none',
      engine: REPO_ESLINT_ENGINE,
      message,
    })),
  ];

  return {
    result: {
      schemaVersion: SCAN_RESULT_SCHEMA_VERSION,
      tool: { name: 'clear-a11y', version: options.toolVersion ?? PACKAGE_VERSION },
      startedAt,
      finishedAt: new Date().toISOString(),
      targets: [target],
      pages,
      findings,
      errors,
      summary: summarize(findings),
    },
    detection,
    notices,
  };
}
