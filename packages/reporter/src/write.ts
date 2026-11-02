import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanResult } from '@clear-a11y/core';
import { toHtml } from './html/to-html.js';
import { toJson } from './json.js';
import type { RenderOptions } from './rules.js';
import { sarifToString, toSarif } from './sarif/to-sarif.js';

export const REPORT_FORMATS = ['json', 'sarif', 'html'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_FILES: Record<ReportFormat, string> = {
  json: 'report.json',
  sarif: 'report.sarif',
  html: 'report.html',
};

export interface WrittenReport {
  format: ReportFormat;
  path: string;
}

export interface WriteOptions extends RenderOptions {
  /** Directory that screenshot paths are relative to. Defaults to `dir`. */
  artifactsDir?: string;
  /** Repository root for repo-relative SARIF locations. */
  repoRoot?: string;
}

/** Validates format names (json, sarif, html) and removes duplicates. Throws on unknown ones. */
export function parseFormats(values: readonly string[]): ReportFormat[] {
  const bad = values.filter((v) => !(REPORT_FORMATS as readonly string[]).includes(v));
  if (bad.length)
    throw new Error(
      `Unknown report format "${bad.join('", "')}". Use ${REPORT_FORMATS.join(', ')}.`,
    );
  return [...new Set(values)] as ReportFormat[];
}

/** Writes the requested formats into `dir` as report.json, report.sarif and report.html. */
export async function writeReports(
  result: ScanResult,
  dir: string,
  formats: readonly ReportFormat[] = ['json'],
  options: WriteOptions = {},
): Promise<WrittenReport[]> {
  await mkdir(dir, { recursive: true });
  const written: WrittenReport[] = [];
  for (const format of parseFormats(formats)) {
    const path = join(dir, REPORT_FILES[format]);
    const content =
      format === 'json'
        ? toJson(result)
        : format === 'sarif'
          ? sarifToString(toSarif(result, options))
          : toHtml(result, { ...options, artifactsDir: options.artifactsDir ?? dir });
    await writeFile(path, content);
    written.push({ format, path });
  }
  return written;
}
