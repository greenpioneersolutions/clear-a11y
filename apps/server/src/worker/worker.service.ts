import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ScanOptions } from '@clear-a11y/runner';
import {
  processJobs,
  type Job,
  type JobContext,
  type Processor,
  type ScanJobPayload,
  type ScanJobResult,
} from '@clear-a11y/queue';
import type { ServerConfig } from '../config.js';
import { ScansService } from '../scans/scans.service.js';
import { ResultStore } from '../storage/result-store.js';
import {
  JOB_QUEUE,
  RESULT_STORE,
  SCAN_FN,
  SERVER_CONFIG,
  type ScanFn,
  type ScanQueue,
} from '../tokens.js';

/**
 * In-process worker: claims scan jobs, runs `scan` from @clear-a11y/runner, stores the ScanResult
 * and records a small summary as the job result. `CLEAR_A11Y_WORKERS` sets the concurrency
 * (0 = no worker in this process). Closes the queue on shutdown.
 */
@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Worker');
  private processor?: Processor;

  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(JOB_QUEUE) private readonly queue: ScanQueue,
    @Inject(RESULT_STORE) private readonly store: ResultStore,
    @Inject(SCAN_FN) private readonly scan: ScanFn,
    @Inject(ScansService) private readonly scans: ScansService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.workers < 1) {
      this.log.log('No in-process workers (CLEAR_A11Y_WORKERS=0).');
      return;
    }
    this.processor = processJobs(this.queue, (job, ctx) => this.run(job, ctx), {
      concurrency: this.config.workers,
      onError: (err) => this.log.error(`Queue error: ${(err as Error).message ?? String(err)}`),
    });
    this.log.log(`Started ${this.config.workers} worker(s) on the ${this.queue.kind} queue.`);
  }

  async run(job: Job<ScanJobPayload, ScanJobResult>, ctx: JobContext): Promise<ScanJobResult> {
    // Check targets again right before scanning: DNS answers can change after submission.
    await this.scans.assertTargetsAllowed(job.payload);
    const dir = await this.store.prepare(job.id);
    const log: NonNullable<ScanOptions['log']> = {
      debug: () => undefined,
      info: () => undefined,
      warn: (message) => this.log.warn(`[${job.id}] ${message}`),
      error: (message) => this.log.error(`[${job.id}] ${message}`),
    };
    let last = Promise.resolve();
    const result = await this.scan({
      targets: job.payload.targets,
      config: job.payload.config ?? {},
      outDir: dir,
      log,
      signal: ctx.signal,
      onProgress: (p) => {
        const progress = { done: p.done, total: p.total, ...(p.url ? { message: p.url } : {}) };
        last = last.then(() => ctx.report(progress)).catch(() => undefined);
      },
    });
    await last;
    const resultRef = await this.store.save(job.id, result);
    return {
      resultRef,
      summary: result.summary,
      pages: result.pages.length,
      errors: result.errors.length,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.processor?.stop();
    await this.queue.close();
  }
}
