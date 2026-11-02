import { join } from 'node:path';
import type { ScanResult } from '@clear-a11y/core';
import { writeReports } from '@clear-a11y/reporter';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../context.js';
import {
  compactFinding,
  compactSummary,
  findingLine,
  LIMITS,
  sortFindings,
  truncate,
  untrustedBlock,
  UNTRUSTED_NOTICE,
  type CompactFinding,
  type CompactSummary,
} from '../format.js';
import { TOP_FINDINGS } from '../schemas.js';
import { newScanId, type StoredScan } from '../store.js';

export interface ScanOutput {
  [key: string]: unknown;
  scanId: string;
  kind: 'url' | 'repo';
  targets: string[];
  pagesScanned: number;
  summary: CompactSummary;
  topFindings: CompactFinding[];
  moreFindings: number;
  errors: { engine: string; url: string; state: string; message: string }[];
  errorCount: number;
  notices: string[];
  reportDir: string;
  untrusted: string;
  next: string;
}

/** Picks the scan id and directory (created on first write: artifacts or report.json). */
export function prepareScan(ctx: ServerContext): { id: string; dir: string } {
  const id = newScanId();
  return { id, dir: join(ctx.outDir, id) };
}

/** Stores a finished scan (and its canonical report.json on disk). */
export async function storeScan(
  ctx: ServerContext,
  scan: Omit<StoredScan, 'createdAt'>,
): Promise<StoredScan> {
  const stored: StoredScan = { ...scan, createdAt: new Date().toISOString() };
  await writeReports(scan.result, scan.dir, ['json']);
  ctx.store.add(stored);
  return stored;
}

/** The structured result shared by scan_url and scan_repo. */
export function scanOutput(scan: StoredScan, top = TOP_FINDINGS): ScanOutput {
  const { result } = scan;
  const sorted = sortFindings(result.findings);
  const summary = compactSummary(result);
  const steps: string[] = [];
  if (summary.violation) steps.push('Fix the violations first (see fix and source).');
  if (summary.likely) steps.push('Verify each likely finding against its evidence, then fix.');
  if (summary.needsReview)
    steps.push(
      `Judge the needs-review questions: get_findings { scanId: "${scan.id}", tier: "needs-review", detail: true }.`,
    );
  if (summary.total > top) steps.push('Page through the rest with get_findings.');
  const next = !result.findings.length
    ? 'No findings. Automated checks cannot prove a page accessible; suggest a manual keyboard and screen reader check of key flows.'
    : `${steps.join(' ')} Re-scan after fixing to verify. get_report writes markdown, SARIF, JSON or HTML.`;
  return {
    scanId: scan.id,
    kind: scan.kind,
    targets: result.targets,
    pagesScanned: result.pages.length,
    summary,
    topFindings: sorted.slice(0, top).map((f) => compactFinding(f, scan.dir)),
    moreFindings: Math.max(0, sorted.length - top),
    errors: result.errors.slice(0, 10).map((e) => ({
      engine: e.engine,
      url: e.url,
      state: e.state,
      message: truncate(e.message, LIMITS.errorMessage),
    })),
    errorCount: result.errors.length,
    notices: scan.notices,
    reportDir: scan.dir,
    untrusted: UNTRUSTED_NOTICE,
    next,
  };
}

export function scanText(out: ScanOutput): string {
  const s = out.summary;
  const lines = [
    `Scan ${out.scanId} (${out.kind}): ${out.pagesScanned} page view(s), ${s.total} finding(s): ${s.violation} violation, ${s.likely} likely, ${s.needsReview} needs-review.`,
    ...out.notices.map((n) => `Note: ${n}`),
    ...(out.errorCount ? [`${out.errorCount} engine/page error(s); see errors.`] : []),
  ];
  if (out.topFindings.length) {
    lines.push(
      '',
      `Top ${out.topFindings.length} finding(s)${out.moreFindings ? ` (${out.moreFindings} more via get_findings)` : ''}:`,
      untrustedBlock(out.topFindings.map(findingLine).join('\n')),
    );
  }
  lines.push('', `Reports: ${out.reportDir}`, `Next: ${out.next}`, '', UNTRUSTED_NOTICE);
  return lines.join('\n');
}

export function toolResult<T extends Record<string, unknown>>(
  structured: T,
  text: string,
): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: structured };
}

export function scanResultOf(ctx: ServerContext, scanId: string): StoredScan {
  const scan = ctx.store.get(scanId);
  if (!scan) {
    const recent = ctx.store
      .list()
      .slice(0, 5)
      .map((s) => s.id);
    throw new Error(
      `Unknown scanId "${truncate(scanId, 64)}". It may have been evicted (the server keeps the ${ctx.store.maxScans} most recent scans) or come from an earlier server session. ${recent.length ? `Recent: ${recent.join(', ')}.` : 'Run scan_url or scan_repo first.'}`,
    );
  }
  return scan;
}

export type { ScanResult };
