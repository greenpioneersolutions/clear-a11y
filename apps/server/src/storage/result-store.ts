import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanResult } from '@clear-a11y/core';
import { parseScanResult, toJson } from '@clear-a11y/reporter';

export const REPORT_FILE = 'report.json';

/**
 * Scan results on disk: `<dataDir>/scans/<jobId>/report.json` plus the scan's `artifacts/`
 * (screenshot crops the HTML report embeds). Job ids are UUIDs, checked before they get here.
 * With several servers behind BullMQ, `DATA_DIR` must be a shared volume.
 */
export class ResultStore {
  constructor(private readonly dataDir: string) {}

  dirFor(jobId: string): string {
    return join(this.dataDir, 'scans', jobId);
  }

  async prepare(jobId: string): Promise<string> {
    const dir = this.dirFor(jobId);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** Writes the canonical JSON and returns its reference (path relative to the data dir). */
  async save(jobId: string, result: ScanResult): Promise<string> {
    const dir = this.dirFor(jobId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, REPORT_FILE), toJson(result));
    return `scans/${jobId}/${REPORT_FILE}`;
  }

  async load(jobId: string): Promise<ScanResult | undefined> {
    try {
      return parseScanResult(await readFile(join(this.dirFor(jobId), REPORT_FILE), 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }
}
