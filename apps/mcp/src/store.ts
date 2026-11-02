import { randomBytes } from 'node:crypto';
import type { ScanResult } from '@clear-a11y/core';

export interface StoredScan {
  id: string;
  kind: 'url' | 'repo';
  createdAt: string;
  result: ScanResult;
  /** Directory holding this scan's artifacts and reports. */
  dir: string;
  /** Repo root for repo scans (repo-relative SARIF locations). */
  repoRoot?: string;
  /** Coverage notes worth repeating to the user (e.g. "source lint only"). */
  notices: string[];
}

/** `s-<time>-<random>`: sortable, short, and safe to use as a directory name. */
export function newScanId(now: Date = new Date()): string {
  return `s-${now.getTime().toString(36)}-${randomBytes(3).toString('hex')}`;
}

export const SCAN_ID_PATTERN = /^s-[a-z0-9]{1,16}-[a-f0-9]{6}$/;

/**
 * Bounded in-memory store of recent scans (least recently used is evicted first). Evicted scans
 * keep their files on disk; only the in-memory index forgets them.
 */
export class ScanStore {
  private readonly scans = new Map<string, StoredScan>();

  constructor(readonly maxScans = 20) {
    if (!Number.isInteger(maxScans) || maxScans < 1) throw new Error('maxScans must be >= 1');
  }

  add(scan: StoredScan): StoredScan[] {
    this.scans.delete(scan.id);
    this.scans.set(scan.id, scan);
    const evicted: StoredScan[] = [];
    while (this.scans.size > this.maxScans) {
      const oldest = this.scans.keys().next().value as string;
      evicted.push(this.scans.get(oldest) as StoredScan);
      this.scans.delete(oldest);
    }
    return evicted;
  }

  /** Looks a scan up and marks it as recently used. */
  get(id: string): StoredScan | undefined {
    const scan = this.scans.get(id);
    if (scan) {
      this.scans.delete(id);
      this.scans.set(id, scan);
    }
    return scan;
  }

  /** Most recently used first. Does not change the order. */
  list(): StoredScan[] {
    return [...this.scans.values()].reverse();
  }

  get size(): number {
    return this.scans.size;
  }
}
