import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { isTerminal, type Job, type JobProgress, type JobQueue } from './types.js';

export interface JobContext {
  /** Records progress (and counts as a heartbeat). */
  report(progress: JobProgress): Promise<void>;
  /** Aborted when the job is cancelled or the worker is stopping. */
  signal: AbortSignal;
  workerId: string;
}

export type JobHandler<TPayload, TResult> = (
  job: Job<TPayload, TResult>,
  ctx: JobContext,
) => Promise<TResult>;

export interface ProcessOptions {
  /** Jobs run at the same time by this worker. Default 1. */
  concurrency?: number;
  /** Stops claiming new jobs and aborts running handlers. */
  signal?: AbortSignal;
  /** Prefix for worker ids. Default `<hostname>:<pid>`. */
  workerId?: string;
  /** Wait between claims when the queue is empty. Default 500 ms. */
  pollIntervalMs?: number;
  /** Heartbeat interval while a handler runs. Default 5 s (keep well under the stale cutoff). */
  heartbeatMs?: number;
  /**
   * Every this often, re-queue running jobs whose worker stopped heart-beating (crashed process).
   * Default 6 x `heartbeatMs`. `false` turns it off.
   */
  recoverStaleAfterMs?: number | false;
  /** Re-queue a job whose handler threw, if it has attempts left. Default false. */
  retryOnError?: boolean;
  /** Called with errors from the loop itself (not from handlers). */
  onError?: (err: unknown) => void;
}

export interface Processor {
  /** Resolves once every slot has stopped: after `stop()` or the abort signal. */
  done: Promise<void>;
  /** Stops claiming, aborts running handlers and waits for them to settle. */
  stop(): Promise<void>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Worker loop over any `JobQueue`: claims jobs, runs `handler`, heart-beats while it runs, and
 * reports the outcome. A cancelled job's handler gets an aborted signal and its result is dropped.
 */
export function processJobs<TPayload, TResult>(
  queue: JobQueue<TPayload, TResult>,
  handler: JobHandler<TPayload, TResult>,
  options: ProcessOptions = {},
): Processor {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const pollMs = options.pollIntervalMs ?? 500;
  const heartbeatMs = options.heartbeatMs ?? 5000;
  const base = options.workerId ?? `${hostname()}:${process.pid}`;
  const onError = options.onError ?? (() => undefined);
  const stopping = new AbortController();
  const outer = options.signal;
  const onOuterAbort = () => stopping.abort();
  if (outer?.aborted) stopping.abort();
  else outer?.addEventListener('abort', onOuterAbort, { once: true });

  async function runOne(job: Job<TPayload, TResult>, workerId: string) {
    const jobAbort = new AbortController();
    let cancelled = false;
    const abortJob = () => jobAbort.abort();
    stopping.signal.addEventListener('abort', abortJob, { once: true });
    const beat = async (progress?: JobProgress) => {
      const hb = await queue.heartbeat(job.id, progress);
      if (hb.cancelled) {
        cancelled = true;
        jobAbort.abort();
      }
    };
    const timer = setInterval(() => {
      beat().catch(onError);
    }, heartbeatMs);
    timer.unref?.();
    try {
      const result = await handler(job, {
        report: (p) => beat(p),
        signal: jobAbort.signal,
        workerId,
      });
      await queue.complete(job.id, result);
    } catch (err) {
      if (stopping.signal.aborted && !cancelled) {
        // Worker shutdown, not a job failure: leave the job running; stale recovery re-queues it.
        return;
      }
      await queue.fail(job.id, messageOf(err), { retry: options.retryOnError ?? false });
    } finally {
      clearInterval(timer);
      stopping.signal.removeEventListener('abort', abortJob);
    }
  }

  async function slot(n: number) {
    const workerId = `${base}:${n}:${randomUUID().slice(0, 8)}`;
    while (!stopping.signal.aborted) {
      let job: Job<TPayload, TResult> | undefined;
      try {
        job = await queue.claim(workerId);
      } catch (err) {
        onError(err);
      }
      if (!job) {
        await sleep(pollMs, stopping.signal);
        continue;
      }
      try {
        await runOne(job, workerId);
      } catch (err) {
        onError(err);
      }
    }
  }

  async function recovery(staleAfterMs: number) {
    while (!stopping.signal.aborted) {
      await queue.recoverStale(staleAfterMs).catch(onError);
      await sleep(staleAfterMs, stopping.signal);
    }
  }

  const staleAfterMs =
    options.recoverStaleAfterMs === false
      ? undefined
      : (options.recoverStaleAfterMs ?? heartbeatMs * 6);
  const loops = Array.from({ length: concurrency }, (_, i) => slot(i));
  if (staleAfterMs !== undefined) loops.push(recovery(staleAfterMs));
  const done = Promise.all(loops).then(() => {
    outer?.removeEventListener('abort', onOuterAbort);
  });
  return {
    done,
    async stop() {
      stopping.abort();
      await done;
    },
  };
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

/** Polls until the job reaches `succeeded`, `failed` or `cancelled`. Works across processes. */
export async function waitForJob<TPayload, TResult>(
  queue: Pick<JobQueue<TPayload, TResult>, 'get'>,
  id: string,
  options: WaitOptions = {},
): Promise<Job<TPayload, TResult>> {
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  const interval = options.intervalMs ?? 250;
  const signal = options.signal ?? new AbortController().signal;
  for (;;) {
    const job = await queue.get(id);
    if (!job) throw new Error(`job ${id} not found`);
    if (isTerminal(job.status)) return job;
    if (signal.aborted) throw new Error('aborted');
    if (Date.now() >= deadline) throw new Error(`job ${id} still ${job.status} after timeout`);
    await sleep(interval, signal);
  }
}
