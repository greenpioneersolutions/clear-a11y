import { isAbsolute } from 'node:path';
import type { ClearA11yConfigInput, ScanResult } from '@clear-a11y/core';
import {
  processJobs,
  type Job,
  type JobContext,
  type JobProgress,
  type JobQueue,
  type Processor,
  type ScanJobResult,
} from '@clear-a11y/queue';
import type { RepoScanOptions, ScanOptions } from '@clear-a11y/runner';
import { z } from 'zod';
import type { ScanRecord, Target } from '../shared/api-types.js';
import type { ResultStore } from './result-store.js';

/** What a desktop scan job stores in the queue: one target, plus a snapshot of the config. */
export const DesktopJobPayloadSchema = z.strictObject({
  targetId: z.string(),
  kind: z.enum(['url', 'repo']),
  target: z.string().min(1),
  label: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type DesktopJobPayload = Omit<z.infer<typeof DesktopJobPayloadSchema>, 'config'> & {
  config?: ClearA11yConfigInput;
};

export type DesktopQueue = JobQueue<DesktopJobPayload, ScanJobResult>;
export type DesktopJob = Job<DesktopJobPayload, ScanJobResult>;

/** The runner functions, injected so tests can stub them. */
export interface ScanFns {
  scan(options: ScanOptions): Promise<ScanResult>;
  scanRepo(options: RepoScanOptions): Promise<{ result: ScanResult }>;
}

export class ScanError extends Error {}

export function toRecord(job: DesktopJob): ScanRecord {
  const record: ScanRecord = {
    id: job.id,
    status: job.status,
    targetId: job.payload.targetId,
    kind: job.payload.kind,
    target: job.payload.target,
    label: job.payload.label,
    createdAt: job.createdAt,
  };
  if (job.startedAt) record.startedAt = job.startedAt;
  if (job.finishedAt) record.finishedAt = job.finishedAt;
  if (job.progress) record.progress = { ...job.progress };
  if (job.error) record.error = job.error;
  if (job.result) {
    record.summary = job.result.summary;
    record.pages = job.result.pages;
    record.errors = job.result.errors;
  }
  return record;
}

export interface ScanServiceOptions {
  queue: DesktopQueue;
  store: ResultStore;
  fns: ScanFns;
  /** Config for new scans (from settings), snapshotted into each job. */
  configFor(): Promise<ClearA11yConfigInput>;
  /** Called on every job change (enqueued, progress, finished, cancelled). */
  onChange?(record: ScanRecord): void;
  /** Reported as the tool version of repo scans. */
  toolVersion?: string;
  heartbeatMs?: number;
  pollIntervalMs?: number;
  onError?(err: unknown): void;
}

/**
 * Queue-backed scans: `start` enqueues one job per target; a single in-process worker
 * (`processJobs`) runs them with the runner and stores the canonical JSON. `cancel` aborts the
 * running scan between pages and drops its result.
 */
export class ScanService {
  private processor?: Processor;
  private readonly unsubscribe: () => void;

  constructor(private readonly options: ScanServiceOptions) {
    this.unsubscribe = options.queue.subscribe((event) => {
      try {
        options.onChange?.(toRecord(event.job));
      } catch (err) {
        options.onError?.(err);
      }
    });
  }

  get queueKind(): string {
    return this.options.queue.kind;
  }

  startWorker(): void {
    if (this.processor) return;
    this.processor = processJobs(this.options.queue, (job, ctx) => this.run(job, ctx), {
      concurrency: 1,
      heartbeatMs: this.options.heartbeatMs ?? 2_000,
      pollIntervalMs: this.options.pollIntervalMs ?? 300,
      workerId: 'desktop',
      ...(this.options.onError ? { onError: this.options.onError } : {}),
    });
  }

  async start(targets: readonly Target[]): Promise<ScanRecord[]> {
    const config = await this.options.configFor();
    const out: ScanRecord[] = [];
    for (const t of targets) {
      const payload: DesktopJobPayload = {
        targetId: t.id,
        kind: t.kind,
        target: t.value,
        label: t.label,
        config,
      };
      out.push(toRecord(await this.options.queue.enqueue(payload, { maxAttempts: 1 })));
    }
    return out;
  }

  async list(limit = 200): Promise<ScanRecord[]> {
    return (await this.options.queue.list({ limit })).map(toRecord);
  }

  async get(id: string): Promise<ScanRecord> {
    return toRecord(await this.job(id));
  }

  async cancel(id: string): Promise<ScanRecord> {
    await this.job(id);
    const job = await this.options.queue.cancel(id);
    if (!job) throw new ScanError('That scan no longer exists.');
    return toRecord(job);
  }

  /** The full result of a finished scan, plus the folder its screenshots live in. */
  async result(id: string): Promise<{ result: ScanResult; dir: string; record: ScanRecord }> {
    const job = await this.job(id);
    if (job.status !== 'succeeded') {
      throw new ScanError(`This scan is ${job.status}. Results exist only for finished scans.`);
    }
    const result = await this.options.store.load(id);
    if (!result) throw new ScanError('The results of this scan are no longer stored.');
    return { result, dir: this.options.store.dirFor(id), record: toRecord(job) };
  }

  /** The worker handler (public for tests). */
  async run(job: DesktopJob, ctx: JobContext): Promise<ScanJobResult> {
    const parsed = DesktopJobPayloadSchema.safeParse(job.payload);
    if (!parsed.success) throw new ScanError('The stored scan job is not valid.');
    const p = parsed.data as DesktopJobPayload;
    const outDir = await this.options.store.prepare(job.id);
    let last = Promise.resolve();
    const report = (progress: JobProgress) => {
      last = last.then(() => ctx.report(progress)).catch(() => undefined);
    };
    const log = { debug: noop, info: noop, warn: noop, error: noop };
    let result: ScanResult;
    if (p.kind === 'url') {
      result = await this.options.fns.scan({
        targets: [p.target],
        ...(p.config ? { config: p.config } : {}),
        outDir,
        log,
        signal: ctx.signal,
        onProgress: (x) =>
          report({ done: x.done, total: x.total, ...(x.url ? { message: x.url } : {}) }),
      });
    } else {
      if (!isAbsolute(p.target)) throw new ScanError('A repo target must be an absolute folder.');
      report({ done: 0, total: 1, message: 'Reading source files' });
      const repo = await this.options.fns.scanRepo({
        path: p.target,
        ...(p.config ? { config: p.config } : {}),
        outDir,
        log,
        ...(this.options.toolVersion ? { toolVersion: this.options.toolVersion } : {}),
      });
      ctx.signal.throwIfAborted();
      result = repo.result;
      report({ done: 1, total: 1 });
    }
    await last;
    const resultRef = await this.options.store.save(job.id, result);
    return {
      resultRef,
      summary: result.summary,
      pages: result.pages.length,
      errors: result.errors.length,
    };
  }

  async close(): Promise<void> {
    await this.processor?.stop();
    this.processor = undefined;
    this.unsubscribe();
    await this.options.queue.close();
  }

  private async job(id: string): Promise<DesktopJob> {
    const job = await this.options.queue.get(id);
    if (!job) throw new ScanError('That scan no longer exists.');
    return job;
  }
}

function noop(): void {
  // Scan logs are not shown in the app; errors arrive as scan errors in the result.
}
