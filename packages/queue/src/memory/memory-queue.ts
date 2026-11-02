import { randomUUID } from 'node:crypto';
import { JobEmitter } from '../events.js';
import {
  isTerminal,
  listLimit,
  maxAttemptsOf,
  STALE_ERROR,
  type EnqueueOptions,
  type FailOptions,
  type HeartbeatResult,
  type Job,
  type JobProgress,
  type JobQueue,
  type ListOptions,
} from '../types.js';

export interface MemoryQueueOptions {
  /** Clock, for tests. */
  now?: () => number;
}

interface Entry<P, R> {
  job: Job<P, R>;
  seq: number;
  heartbeatAt: number;
}

/**
 * Jobs in a Map. For tests and as the desktop fallback when no file can be written. Nothing
 * survives the process.
 */
export function createMemoryQueue<TPayload = unknown, TResult = unknown>(
  options: MemoryQueueOptions = {},
): JobQueue<TPayload, TResult> {
  const now = options.now ?? Date.now;
  const iso = () => new Date(now()).toISOString();
  const entries = new Map<string, Entry<TPayload, TResult>>();
  const emitter = new JobEmitter<TPayload, TResult>();
  let seq = 0;
  let closed = false;

  const copy = (job: Job<TPayload, TResult>): Job<TPayload, TResult> => structuredClone(job);
  const live = () => {
    if (closed) throw new Error('queue is closed');
  };
  const update = (entry: Entry<TPayload, TResult>, patch: Partial<Job<TPayload, TResult>>) => {
    entry.job = { ...entry.job, ...patch, updatedAt: iso() };
    for (const key of Object.keys(entry.job) as (keyof Job)[]) {
      if (entry.job[key] === undefined) delete entry.job[key];
    }
    return copy(entry.job);
  };

  return {
    kind: 'memory',
    async enqueue(payload: TPayload, opts?: EnqueueOptions) {
      live();
      const at = iso();
      const job: Job<TPayload, TResult> = {
        id: randomUUID(),
        status: 'queued',
        payload: structuredClone(payload),
        attempts: 0,
        maxAttempts: maxAttemptsOf(opts),
        createdAt: at,
        updatedAt: at,
      };
      entries.set(job.id, { job, seq: seq++, heartbeatAt: 0 });
      const out = copy(job);
      emitter.emit('enqueued', out);
      return out;
    },
    async get(id: string) {
      live();
      const entry = entries.get(id);
      return entry ? copy(entry.job) : undefined;
    },
    async list(opts: ListOptions = {}) {
      live();
      const limit = listLimit(opts.limit);
      return [...entries.values()]
        .filter((e) => !opts.status || e.job.status === opts.status)
        .sort((a, b) => b.seq - a.seq)
        .slice(0, limit)
        .map((e) => copy(e.job));
    },
    async claim(workerId: string) {
      live();
      const next = [...entries.values()]
        .filter((e) => e.job.status === 'queued')
        .sort((a, b) => a.seq - b.seq)[0];
      if (!next) return undefined;
      next.heartbeatAt = now();
      const job = update(next, {
        status: 'running',
        attempts: next.job.attempts + 1,
        workerId,
        startedAt: iso(),
        finishedAt: undefined,
        error: undefined,
      });
      emitter.emit('claimed', job);
      return job;
    },
    async heartbeat(id: string, progress?: JobProgress): Promise<HeartbeatResult> {
      live();
      const entry = entries.get(id);
      if (!entry || entry.job.status !== 'running') {
        return { cancelled: entry?.job.status === 'cancelled' };
      }
      entry.heartbeatAt = now();
      if (progress) emitter.emit('progress', update(entry, { progress: { ...progress } }));
      return { cancelled: false };
    },
    async complete(id: string, result: TResult) {
      live();
      const entry = entries.get(id);
      if (!entry) return undefined;
      if (entry.job.status !== 'running') return copy(entry.job);
      const job = update(entry, {
        status: 'succeeded',
        result: structuredClone(result),
        finishedAt: iso(),
      });
      emitter.emit('succeeded', job);
      return job;
    },
    async fail(id: string, error: string, opts: FailOptions = {}) {
      live();
      const entry = entries.get(id);
      if (!entry) return undefined;
      if (entry.job.status !== 'running') return copy(entry.job);
      if (opts.retry && entry.job.attempts < entry.job.maxAttempts) {
        const job = update(entry, { status: 'queued', error, workerId: undefined });
        emitter.emit('requeued', job);
        return job;
      }
      const job = update(entry, { status: 'failed', error, finishedAt: iso() });
      emitter.emit('failed', job);
      return job;
    },
    async cancel(id: string) {
      live();
      const entry = entries.get(id);
      if (!entry) return undefined;
      if (isTerminal(entry.job.status)) return copy(entry.job);
      const job = update(entry, { status: 'cancelled', finishedAt: iso() });
      emitter.emit('cancelled', job);
      return job;
    },
    async recoverStale(staleAfterMs: number) {
      live();
      let touched = 0;
      for (const entry of entries.values()) {
        if (entry.job.status !== 'running' || now() - entry.heartbeatAt < staleAfterMs) continue;
        touched++;
        if (entry.job.attempts < entry.job.maxAttempts) {
          emitter.emit('requeued', update(entry, { status: 'queued', workerId: undefined }));
        } else {
          emitter.emit(
            'failed',
            update(entry, { status: 'failed', error: STALE_ERROR, finishedAt: iso() }),
          );
        }
      }
      return touched;
    },
    subscribe(listener) {
      return emitter.subscribe(listener);
    },
    async close() {
      closed = true;
      emitter.clear();
    },
  };
}
