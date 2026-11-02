import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Finding, ScanResult } from '@clear-a11y/core';
import type { Job, JobStatus, ScanJobPayload, ScanJobResult } from '@clear-a11y/queue';
import { sarifToString, toHtml, toJson, toSarif } from '@clear-a11y/reporter';
import { allRules } from '@clear-a11y/runner';
import type { z } from 'zod';
import type { ServerConfig } from '../config.js';
import { checkTarget, type Lookup } from '../security/ssrf.js';
import { ResultStore } from '../storage/result-store.js';
import { DNS_LOOKUP, JOB_QUEUE, RESULT_STORE, SERVER_CONFIG, type ScanQueue } from '../tokens.js';
import { createScanRequestSchema, isJobId } from './dto.js';

/** What the API shows for a job. The submitted config is not echoed back. */
export interface ScanView {
  id: string;
  status: JobStatus;
  targets: string[];
  label?: string;
  progress?: Job['progress'];
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  summary?: ScanJobResult['summary'];
  links: { self: string; results?: string; report?: string };
}

export function toView(job: Job<ScanJobPayload, ScanJobResult>): ScanView {
  const self = `/scans/${job.id}`;
  const view: ScanView = {
    id: job.id,
    status: job.status,
    targets: job.payload.targets,
    attempts: job.attempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    links: { self },
  };
  if (job.payload.label) view.label = job.payload.label;
  if (job.progress) view.progress = job.progress;
  if (job.startedAt) view.startedAt = job.startedAt;
  if (job.finishedAt) view.finishedAt = job.finishedAt;
  if (job.error) view.error = job.error;
  if (job.status === 'succeeded') {
    if (job.result) view.summary = job.result.summary;
    view.links.results = `${self}/results`;
    view.links.report = `${self}/report?format=html`;
  }
  return view;
}

/** Zod issues as `{ path, message }`, without the submitted values. */
export function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

export type ReportFormat = 'html' | 'sarif' | 'json';

export const REPORT_CONTENT_TYPES: Record<ReportFormat, string> = {
  html: 'text/html; charset=utf-8',
  sarif: 'application/sarif+json; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

@Injectable()
export class ScansService {
  private readonly schema: ReturnType<typeof createScanRequestSchema>;

  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(JOB_QUEUE) private readonly queue: ScanQueue,
    @Inject(RESULT_STORE) private readonly store: ResultStore,
    @Inject(DNS_LOOKUP) private readonly lookup: Lookup,
  ) {
    this.schema = createScanRequestSchema(config);
  }

  /** Validates the body and every target (SSRF guard). Throws 400 with readable issues. */
  async validate(body: unknown): Promise<ScanJobPayload> {
    const parsed = this.schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid scan request.',
        issues: issuesOf(parsed.error),
      });
    }
    const payload = parsed.data as ScanJobPayload;
    await this.assertTargetsAllowed(payload);
    return payload;
  }

  async assertTargetsAllowed(payload: ScanJobPayload): Promise<void> {
    const targets = [...payload.targets, ...(payload.config?.targets ?? [])];
    const issues: { path: string; message: string }[] = [];
    for (const [i, target] of targets.entries()) {
      const check = await checkTarget(target, {
        allowlist: this.config.allowedTargets,
        lookup: this.lookup,
      });
      if (!check.ok) {
        const path =
          i < payload.targets.length
            ? `targets.${i}`
            : `config.targets.${i - payload.targets.length}`;
        issues.push({ path, message: `target ${check.reason}` });
      }
    }
    if (issues.length) {
      throw new BadRequestException({ message: 'Target not allowed.', issues });
    }
  }

  async create(body: unknown): Promise<ScanView> {
    const payload = await this.validate(body);
    // A crashed worker's job is retried; a scan that fails on its own is not (see worker).
    return toView(await this.queue.enqueue(payload, { maxAttempts: 3 }));
  }

  async list(opts: { status?: JobStatus; limit: number }): Promise<ScanView[]> {
    return (await this.queue.list(opts)).map(toView);
  }

  async job(id: string): Promise<Job<ScanJobPayload, ScanJobResult>> {
    const job = isJobId(id) ? await this.queue.get(id) : undefined;
    if (!job) throw new NotFoundException(`No scan with id ${isJobId(id) ? id : '(invalid id)'}.`);
    return job;
  }

  async get(id: string): Promise<ScanView> {
    return toView(await this.job(id));
  }

  async cancel(id: string): Promise<ScanView> {
    await this.job(id);
    const job = await this.queue.cancel(id);
    if (!job) throw new NotFoundException(`No scan with id ${id}.`);
    return toView(job);
  }

  /** The full ScanResult of a succeeded scan. 409 while it is not finished. */
  async result(id: string): Promise<ScanResult> {
    const job = await this.job(id);
    if (job.status !== 'succeeded') {
      throw new ConflictException({
        message: `Scan is ${job.status}; results exist only for succeeded scans.`,
        status: job.status,
      });
    }
    const result = await this.store.load(id);
    if (!result) throw new NotFoundException('The results of this scan are no longer stored.');
    return result;
  }

  async findings(
    id: string,
    filter: { tier?: Finding['tier']; wcag?: string },
  ): Promise<Finding[]> {
    const { findings } = await this.result(id);
    return findings.filter(
      (f) =>
        (!filter.tier || f.tier === filter.tier) && (!filter.wcag || f.wcag.includes(filter.wcag)),
    );
  }

  async report(id: string, format: ReportFormat): Promise<string> {
    const result = await this.result(id);
    if (format === 'json') return toJson(result);
    if (format === 'sarif') return sarifToString(toSarif(result, { rules: allRules() }));
    return toHtml(result, { rules: allRules(), artifactsDir: this.store.dirFor(id) });
  }
}
