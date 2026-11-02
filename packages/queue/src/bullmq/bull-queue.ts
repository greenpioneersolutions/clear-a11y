import { randomUUID } from 'node:crypto';
import { JobEmitter } from '../events.js';
import {
  CANCELLED_ERROR,
  isTerminal,
  listLimit,
  maxAttemptsOf,
  type EnqueueOptions,
  type FailOptions,
  type Job,
  type JobEventType,
  type JobProgress,
  type JobQueue,
  type JobStatus,
  type ListOptions,
} from '../types.js';

/*
 * The subset of BullMQ this adapter uses, typed structurally so the mapping can be unit-tested
 * with a small fake (no Redis) and `bullmq` is only loaded when this queue is created.
 */

export interface BullJobLike {
  id?: string;
  data: unknown;
  opts: { attempts?: number };
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  attemptsMade: number;
  attemptsStarted?: number;
  progress: unknown;
  returnvalue: unknown;
  failedReason?: string;
  updateData(data: never): Promise<unknown>;
  updateProgress(progress: never): Promise<unknown>;
  extendLock(token: string, duration: number): Promise<unknown>;
  moveToCompleted(value: never, token: string, fetchNext?: boolean): Promise<unknown>;
  moveToFailed(err: Error, token: string, fetchNext?: boolean): Promise<unknown>;
  getState(): Promise<string>;
}

export interface BullQueueLike {
  add(name: string, data: never, opts?: never): Promise<BullJobLike>;
  getJob(id: string): Promise<BullJobLike | undefined | null>;
  getJobs(types?: never, start?: number, end?: number, asc?: boolean): Promise<BullJobLike[]>;
  close(): Promise<void>;
}

export interface BullWorkerLike {
  getNextJob(token: string, opts?: { block?: boolean }): Promise<BullJobLike | undefined>;
  startStalledCheckTimer?(): Promise<void>;
  close(): Promise<void>;
}

export interface BullModuleLike {
  Queue: new (name: string, opts: never) => BullQueueLike;
  Worker: new (name: string, processor: null, opts: never) => BullWorkerLike;
  UnrecoverableError: new (message?: string) => Error;
}

export interface BullQueueOptions {
  /** Redis URL, e.g. `redis://localhost:6379`. Creates (and closes) an ioredis connection. */
  url?: string;
  /** Or an existing BullMQ connection (ioredis instance or options). Closed by its owner. */
  connection?: unknown;
  /** BullMQ queue name. Default `clear-a11y-scans`. */
  name?: string;
  /** Redis key prefix. Default `bull`. */
  prefix?: string;
  /**
   * A claimed job whose lock is not extended (by `heartbeat`) for this long is treated as stalled
   * by BullMQ and moved back to waiting. Default 30 s.
   */
  lockDurationMs?: number;
  /** Loads BullMQ. Tests pass a fake. */
  loadBullmq?: () => Promise<BullModuleLike>;
}

/** What we keep in BullMQ's `job.data`. */
export interface BullJobData<P> {
  payload: P;
  workerId?: string;
  cancelledAt?: string;
}

const QUEUED_STATES = ['waiting', 'prioritized', 'delayed', 'paused', 'waiting-children'];
const STATES_BY_STATUS: Record<Exclude<JobStatus, 'cancelled'>, string[]> = {
  queued: QUEUED_STATES,
  running: ['active'],
  succeeded: ['completed'],
  failed: ['failed'],
};

/** BullMQ state -> our status. `undefined` for a job BullMQ no longer knows. */
export function statusFromBullState(state: string): Exclude<JobStatus, 'cancelled'> | undefined {
  if (QUEUED_STATES.includes(state)) return 'queued';
  if (state === 'active') return 'running';
  if (state === 'completed') return 'succeeded';
  if (state === 'failed') return 'failed';
  return undefined;
}

const isoOf = (ms: number | undefined) =>
  ms === undefined || ms === null ? undefined : new Date(ms).toISOString();

function isProgress(value: unknown): value is JobProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as JobProgress).done === 'number' &&
    typeof (value as JobProgress).total === 'number'
  );
}

/** Maps a BullMQ job plus its state onto our `Job`. Pure; unit-tested without Redis. */
export function bullJobToJob<P, R>(bull: BullJobLike, state: string): Job<P, R> | undefined {
  const base = statusFromBullState(state);
  if (!base || bull.id === undefined) return undefined;
  const data = (bull.data ?? {}) as BullJobData<P>;
  const status: JobStatus = data.cancelledAt ? 'cancelled' : base;
  const createdAt = new Date(bull.timestamp).toISOString();
  const startedAt = isoOf(bull.processedOn);
  const finishedAt =
    data.cancelledAt ??
    (status === 'succeeded' || status === 'failed' ? isoOf(bull.finishedOn) : undefined);
  const updatedAt = [createdAt, startedAt, finishedAt]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) as string;
  const job: Job<P, R> = {
    id: bull.id,
    status,
    payload: data.payload,
    attempts: bull.attemptsStarted ?? bull.attemptsMade,
    maxAttempts: bull.opts.attempts ?? 1,
    createdAt,
    updatedAt,
  };
  if (status === 'succeeded') job.result = bull.returnvalue as R;
  if (bull.failedReason && status !== 'cancelled') job.error = bull.failedReason;
  if (isProgress(bull.progress)) job.progress = bull.progress;
  if (data.workerId) job.workerId = data.workerId;
  if (startedAt) job.startedAt = startedAt;
  if (finishedAt) job.finishedAt = finishedAt;
  return job;
}

/**
 * BullMQ (Redis) queue for teams running several workers. Jobs are claimed with BullMQ's manual
 * fetching (`worker.getNextJob`), locks are extended by `heartbeat`, retries use BullMQ's
 * `attempts`, and stalled jobs are moved back by BullMQ's own stalled-job checker.
 */
export async function createBullQueue<TPayload = unknown, TResult = unknown>(
  options: BullQueueOptions,
): Promise<JobQueue<TPayload, TResult>> {
  const bull = await (options.loadBullmq ?? loadBullmq)();
  const name = options.name ?? 'clear-a11y-scans';
  const lockDuration = options.lockDurationMs ?? 30_000;
  let ownConnection: { quit(): Promise<unknown> } | undefined;
  let connection = options.connection;
  if (!connection) {
    if (!options.url) throw new Error('createBullQueue needs a Redis `url` or a `connection`.');
    const { Redis } = await import('ioredis');
    const redis = new Redis(options.url, { maxRetriesPerRequest: null, lazyConnect: false });
    ownConnection = redis;
    connection = redis;
  }
  const common = { connection, ...(options.prefix ? { prefix: options.prefix } : {}) };
  const queue = new bull.Queue(name, common as never);
  let worker: BullWorkerLike | undefined;
  const tokens = new Map<string, string>();
  const emitter = new JobEmitter<TPayload, TResult>();
  let closed = false;

  const live = () => {
    if (closed) throw new Error('queue is closed');
  };
  const workerFor = () => {
    if (!worker) {
      worker = new bull.Worker(name, null, { ...common, lockDuration } as never);
      worker.startStalledCheckTimer?.().catch(() => undefined);
    }
    return worker;
  };
  const read = async (id: string) => {
    const job = await queue.getJob(id);
    if (!job) return undefined;
    return { bull: job, state: await job.getState() };
  };
  const map = (bullJob: BullJobLike, state: string) =>
    bullJobToJob<TPayload, TResult>(bullJob, state);
  const fetch = async (id: string) => {
    const r = await read(id);
    return r ? map(r.bull, r.state) : undefined;
  };
  const emit = (type: JobEventType, job: Job<TPayload, TResult> | undefined) => {
    emitter.emit(type, job);
    return job;
  };
  const dataOf = (job: BullJobLike) => (job.data ?? {}) as BullJobData<TPayload>;

  async function finishCancelled(job: BullJobLike, token: string) {
    await job.moveToFailed(new bull.UnrecoverableError(CANCELLED_ERROR), token, false);
  }

  return {
    kind: 'bullmq',
    async enqueue(payload: TPayload, opts?: EnqueueOptions) {
      live();
      const data: BullJobData<TPayload> = { payload };
      const added = await queue.add(
        'scan',
        data as never,
        {
          jobId: randomUUID(),
          attempts: maxAttemptsOf(opts),
          removeOnComplete: false,
          removeOnFail: false,
        } as never,
      );
      return emit('enqueued', map(added, 'waiting')) as Job<TPayload, TResult>;
    },
    async get(id: string) {
      live();
      return fetch(id);
    },
    async list(opts: ListOptions = {}) {
      live();
      const limit = listLimit(opts.limit);
      const groups: [string, string[]][] =
        opts.status && opts.status !== 'cancelled'
          ? [[opts.status, STATES_BY_STATUS[opts.status]]]
          : Object.entries(STATES_BY_STATUS);
      // A cancelled job keeps its BullMQ state, so a `cancelled` filter has to scan widely.
      const fetchCount = opts.status === 'cancelled' ? 1000 : limit;
      const jobs: Job<TPayload, TResult>[] = [];
      for (const [status, states] of groups) {
        const found = await queue.getJobs(states as never, 0, fetchCount - 1, false);
        const state = STATES_BY_STATUS[status as keyof typeof STATES_BY_STATUS][0] as string;
        for (const b of found) {
          const job = map(b, state);
          if (job) jobs.push(job);
        }
      }
      return (
        jobs
          .filter((j) => !opts.status || j.status === opts.status)
          // Stable sort: within one millisecond, BullMQ's own newest-first order is kept.
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
      );
    },
    async claim(workerId: string) {
      live();
      const w = workerFor();
      for (;;) {
        const token = `${workerId}:${randomUUID()}`;
        const next = await w.getNextJob(token, { block: false });
        if (!next || next.id === undefined) return undefined;
        if (dataOf(next).cancelledAt) {
          await finishCancelled(next, token);
          continue;
        }
        tokens.set(next.id, token);
        await next.updateData({ ...dataOf(next), workerId } as never);
        next.data = { ...dataOf(next), workerId };
        return emit('claimed', map(next, 'active'));
      }
    },
    async heartbeat(id: string, progress?: JobProgress) {
      live();
      const r = await read(id);
      if (!r) return { cancelled: false };
      if (dataOf(r.bull).cancelledAt) return { cancelled: true };
      const token = tokens.get(id);
      if (r.state !== 'active') return { cancelled: false };
      if (token) await r.bull.extendLock(token, lockDuration);
      if (progress) {
        await r.bull.updateProgress({ ...progress } as never);
        r.bull.progress = { ...progress };
        emit('progress', map(r.bull, r.state));
      }
      return { cancelled: false };
    },
    async complete(id: string, result: TResult) {
      live();
      const r = await read(id);
      if (!r) return undefined;
      const token = tokens.get(id);
      if (r.state !== 'active' || !token) return map(r.bull, r.state);
      tokens.delete(id);
      if (dataOf(r.bull).cancelledAt) {
        await finishCancelled(r.bull, token);
        return fetch(id);
      }
      await r.bull.moveToCompleted((result ?? null) as never, token, false);
      return emit('succeeded', await fetch(id));
    },
    async fail(id: string, error: string, opts: FailOptions = {}) {
      live();
      const r = await read(id);
      if (!r) return undefined;
      const token = tokens.get(id);
      if (r.state !== 'active' || !token) return map(r.bull, r.state);
      tokens.delete(id);
      if (dataOf(r.bull).cancelledAt) {
        await finishCancelled(r.bull, token);
        return fetch(id);
      }
      const err = opts.retry ? new Error(error) : new bull.UnrecoverableError(error);
      await r.bull.moveToFailed(err, token, false);
      const job = await fetch(id);
      return emit(job?.status === 'queued' ? 'requeued' : 'failed', job);
    },
    async cancel(id: string) {
      live();
      const r = await read(id);
      if (!r) return undefined;
      const current = map(r.bull, r.state);
      if (!current || isTerminal(current.status)) return current;
      const cancelledAt = new Date().toISOString();
      await r.bull.updateData({ ...dataOf(r.bull), cancelledAt } as never);
      r.bull.data = { ...dataOf(r.bull), cancelledAt };
      return emit('cancelled', map(r.bull, r.state));
    },
    async recoverStale() {
      live();
      // BullMQ's stalled-job checker (started with the worker) moves jobs whose lock expired back
      // to waiting, or to failed after `maxStalledCount`. Nothing to do here.
      return 0;
    },
    subscribe(listener) {
      return emitter.subscribe(listener);
    },
    async close() {
      if (closed) return;
      closed = true;
      emitter.clear();
      await worker?.close();
      await queue.close();
      await ownConnection?.quit();
    },
  };
}

async function loadBullmq(): Promise<BullModuleLike> {
  try {
    return (await import('bullmq')) as unknown as BullModuleLike;
  } catch (err) {
    throw new Error(
      `The BullMQ queue needs the "bullmq" and "ioredis" packages: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
