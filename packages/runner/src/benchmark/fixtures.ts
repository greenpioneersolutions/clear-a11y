import { startStaticServer } from '@clear-a11y/browser';
import type { ClearA11yConfigInput } from '@clear-a11y/core';
import { createScanner, type ScannerOptions } from '../scan.js';
import { loadExpected } from './load.js';
import { runBenchmark } from './run.js';
import type { BenchmarkResult } from './types.js';

export interface FixtureBenchmarkOptions extends Omit<ScannerOptions, 'config'> {
  /** Directory with the fixture pages (served on localhost). */
  siteDir: string;
  /** Directory with the expected-findings JSON files. */
  expectedDir: string;
  config?: ClearA11yConfigInput;
  /**
   * Persona tasks (the `personas` config section), e.g. the contents of fixtures/personas.json.
   * Enables the persona engine on the pages the tasks match.
   */
  personas?: Record<string, unknown>;
  label?: string;
  /** Only pages whose path starts with this prefix. */
  filter?: string;
  concurrency?: number;
  onPage?: (page: string, findings: number) => void;
}

/** Serves a fixture site on 127.0.0.1, scans every expected page and scores the result. */
export async function runFixtureBenchmark(
  options: FixtureBenchmarkOptions,
): Promise<BenchmarkResult> {
  const expected = (await loadExpected(options.expectedDir)).filter(
    (p) => !options.filter || p.page.startsWith(options.filter),
  );
  const server = await startStaticServer({ root: options.siteDir });
  const scanner = await createScanner({
    ...options,
    config: {
      ...options.config,
      ...(options.personas ? { personas: options.personas } : {}),
      output: { screenshots: false, ...options.config?.output },
    },
  });
  try {
    return await runBenchmark({
      expected,
      baseUrl: server.url('/'),
      label: options.label,
      concurrency: options.concurrency,
      scan: async (url) => (await scanner.scanUrl(url)).findings,
      onPage: (page, findings) => options.onPage?.(page, findings.length),
    });
  } finally {
    await scanner.close();
    await server.close();
  }
}
