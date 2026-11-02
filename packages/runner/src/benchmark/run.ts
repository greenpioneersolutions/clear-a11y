import type { ExpectedPage, Finding } from '@clear-a11y/core';
import { pagePathOf } from './match.js';
import { scoreBenchmark } from './score.js';
import type { BenchmarkResult } from './types.js';

export type PageScanner = (url: string) => Promise<Finding[]>;

export interface RunBenchmarkOptions {
  expected: readonly ExpectedPage[];
  /** Base URL where the fixture site is served, e.g. http://127.0.0.1:4173/ */
  baseUrl: string;
  scan: PageScanner;
  label?: string;
  /** Pages scanned in parallel. */
  concurrency?: number;
  onPage?: (page: string, findings: readonly Finding[]) => void;
}

export async function runBenchmark(options: RunBenchmarkOptions): Promise<BenchmarkResult> {
  const base = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
  const byPage = new Map<string, Finding[]>();
  const queue = [...options.expected];
  const worker = async () => {
    for (let page = queue.shift(); page; page = queue.shift()) {
      const findings = await options.scan(new URL(page.page, base).href);
      // Findings are keyed by the page they were reported on (normally the scanned page).
      for (const f of findings) {
        const key = pagePathOf(f.page.url, base);
        byPage.set(key, [...(byPage.get(key) ?? []), f]);
      }
      if (!byPage.has(page.page)) byPage.set(page.page, []);
      options.onPage?.(page.page, findings);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 2) }, worker));
  return scoreBenchmark(options.expected, byPage, { label: options.label });
}
