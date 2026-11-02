import { isAbsolute, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Finding, ScanResult } from '@clear-a11y/core';
import { collectRules, PROJECT_URL, type RenderOptions, type RuleInfo } from '../rules.js';
import { sarifLevel } from './levels.js';
import type { SarifLocation, SarifLog, SarifReportingDescriptor, SarifResult } from './types.js';

export const SARIF_SCHEMA_URL =
  'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json';
/** Key under `partialFingerprints`. Bump the version if `Finding.id` ever changes meaning. */
export const FINGERPRINT_KEY = 'clearA11y/v1';
const SRCROOT = 'SRCROOT';

export interface SarifOptions extends RenderOptions {
  /** Overrides `result.tool.version`. */
  toolVersion?: string;
  /** Repository root: absolute `finding.source.file` paths are made relative to it. */
  repoRoot?: string;
}

const toPosix = (p: string) => p.split(sep).join('/').replace(/\\/g, '/');

/** Repo-relative, forward-slash path for a source file. */
export function sourceUri(file: string, repoRoot?: string): { uri: string; relative: boolean } {
  if (isAbsolute(file)) {
    if (repoRoot) {
      const rel = relative(repoRoot, file);
      if (!rel.startsWith('..') && !isAbsolute(rel)) return { uri: toPosix(rel), relative: true };
    }
    return { uri: pathToFileURL(file).href, relative: false };
  }
  return { uri: toPosix(file).replace(/^\.\//, ''), relative: true };
}

/**
 * Where a finding lives. Source-mapped findings point at the repo file and line (GitHub code
 * scanning only shows results that have such a location). Page-only findings point at the page
 * URL and carry the CSS selector and page state as a logical location.
 */
export function sarifLocation(finding: Finding, repoRoot?: string): SarifLocation {
  const logical = {
    name: finding.target.selector,
    fullyQualifiedName: `${finding.page.url} [state: ${finding.page.state}] ${finding.target.selector}`,
    kind: 'element',
    properties: { state: finding.page.state, viewport: finding.page.viewport },
  };
  if (finding.source) {
    const { uri, relative: isRelative } = sourceUri(finding.source.file, repoRoot);
    const column = finding.source.column;
    return {
      physicalLocation: {
        artifactLocation: { uri, ...(isRelative && repoRoot ? { uriBaseId: SRCROOT } : {}) },
        region: {
          startLine: finding.source.line,
          ...(column !== undefined && column >= 1 ? { startColumn: column } : {}),
        },
      },
      logicalLocations: [logical],
    };
  }
  return {
    physicalLocation: { artifactLocation: { uri: finding.page.url } },
    logicalLocations: [logical],
  };
}

function descriptor(rule: RuleInfo): SarifReportingDescriptor {
  return {
    id: rule.id,
    name: rule.title,
    shortDescription: { text: rule.title },
    ...(rule.description ? { fullDescription: { text: rule.description } } : {}),
    ...(rule.fix ? { help: { text: rule.fix } } : {}),
    helpUri: rule.helpUri,
    defaultConfiguration: { level: sarifLevel(rule.tier) },
    properties: {
      wcag: rule.wcag,
      tier: rule.tier,
      engine: rule.engine,
      tags: ['accessibility', ...rule.wcag.map((sc) => `wcag/${sc}`), `tier/${rule.tier}`],
    },
  };
}

function resultFor(finding: Finding, ruleIndex: number, repoRoot?: string): SarifResult {
  const text = finding.fix ? `${finding.message}\nHow to fix: ${finding.fix}` : finding.message;
  return {
    ruleId: finding.ruleId,
    ruleIndex,
    level: sarifLevel(finding.tier),
    message: { text },
    locations: [sarifLocation(finding, repoRoot)],
    partialFingerprints: { [FINGERPRINT_KEY]: finding.id },
    properties: {
      tier: finding.tier,
      confidence: finding.confidence,
      engine: finding.engine,
      wcag: finding.wcag,
      url: finding.page.url,
      state: finding.page.state,
      viewport: finding.page.viewport,
      selector: finding.target.selector,
      ...(finding.question ? { question: finding.question } : {}),
      tags: [...finding.wcag.map((sc) => `wcag/${sc}`), `tier/${finding.tier}`],
    },
  };
}

/** SARIF 2.1.0 log for a scan: one run, one result per finding (none added, none dropped). */
export function toSarif(result: ScanResult, options: SarifOptions = {}): SarifLog {
  const rules = collectRules(result.findings, options.rules);
  const index = new Map(rules.map((r, i) => [r.id, i]));
  const version = options.toolVersion ?? result.tool.version;
  return {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Clear A11Y',
            version,
            ...(/^\d+\.\d+\.\d+/.test(version) ? { semanticVersion: version } : {}),
            informationUri: PROJECT_URL,
            rules: rules.map(descriptor),
          },
        },
        ...(options.repoRoot
          ? {
              originalUriBaseIds: {
                [SRCROOT]: { uri: pathToFileURL(options.repoRoot).href.replace(/\/?$/, '/') },
              },
            }
          : {}),
        invocations: [
          {
            executionSuccessful: result.errors.length === 0,
            startTimeUtc: result.startedAt,
            endTimeUtc: result.finishedAt,
            ...(result.errors.length
              ? {
                  toolExecutionNotifications: result.errors.map((e) => ({
                    level: 'warning' as const,
                    message: { text: `${e.engine} failed on ${e.url} [${e.state}]: ${e.message}` },
                    descriptor: { id: e.engine },
                    properties: { url: e.url, state: e.state, viewport: e.viewport },
                  })),
                }
              : {}),
          },
        ],
        results: result.findings.map((f) =>
          resultFor(f, index.get(f.ruleId) ?? 0, options.repoRoot),
        ),
      },
    ],
  };
}

/** SARIF 2.1.0 as a JSON string (what `report.sarif` contains). */
export function sarifToString(log: SarifLog): string {
  return JSON.stringify(log, null, 2) + '\n';
}
