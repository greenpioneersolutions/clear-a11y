export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses a job never leaves. */
export const TERMINAL_STATUSES: readonly JobStatus[] = ['succeeded', 'failed', 'cancelled'];

export const isTerminal = (status: JobStatus): boolean => TERMINAL_STATUSES.includes(status);

export interface JobProgress {
  done: number;
  total: number;
  message?: string;
}

export interface Job<TPayload = unknown, TResult = unknown> {
  id: string;
  status: JobStatus;
  payload: TPayload;
  /** Set when the job succeeded. Keep it small (a summary or a reference); store big blobs elsewhere. */
  result?: TResult;
  /** Set when the job failed (or was cancelled). Plain message, no stack. */
  error?: string;
  progress?: JobProgress;
  /** How many times a worker claimed the job. */
  attempts: number;
  /** A job is retried (re-queued) until it has been claimed this many times. */
  maxAttempts: number;
  /** The worker that claimed it last. */
  workerId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface EnqueueOptions {
  /** Claims allowed before a failing job stays failed. Default 1 (no retry). */
  maxAttempts?: number;
}

export interface ListOptions {
  status?: JobStatus;
  /** Default 50, max 1000. Newest first. */
  limit?: number;
}

export interface FailOptions {
  /** Re-queue the job if it has attempts left. Default false. */
  retry?: boolean;
}

export interface HeartbeatResult {
  /** The job was cancelled while running: the worker should stop and not report a result. */
  cancelled: boolean;
}

export type JobEventType =
  'enqueued' | 'claimed' | 'progress' | 'succeeded' | 'failed' | 'requeued' | 'cancelled';

export interface JobEvent<TPayload = unknown, TResult = unknown> {
  type: JobEventType;
  job: Job<TPayload, TResult>;
}

export type JobListener<TPayload = unknown, TResult = unknown> = (
  event: JobEvent<TPayload, TResult>,
) => void;

/**
 * A persistent FIFO job queue. Every implementation passes the shared contract suite
 * (`runQueueContract` from `@clear-a11y/queue/testing`).
 *
 * Lifecycle: `queued` -> `running` (claim) -> `succeeded` | `failed`, or back to `queued` on a
 * retry or when a worker stops heart-beating. `cancel` moves a queued or running job to
 * `cancelled`; a running worker learns about it from `heartbeat` and its later `complete`/`fail`
 * calls are ignored.
 */
export interface JobQueue<TPayload = unknown, TResult = unknown> {
  /** `memory`, `sqlite` or `bullmq`. */
  readonly kind: string;
  enqueue(payload: TPayload, opts?: EnqueueOptions): Promise<Job<TPayload, TResult>>;
  get(id: string): Promise<Job<TPayload, TResult> | undefined>;
  list(opts?: ListOptions): Promise<Job<TPayload, TResult>[]>;
  /** Atomically takes the oldest queued job. Two workers never get the same job. */
  claim(workerId: string): Promise<Job<TPayload, TResult> | undefined>;
  /** Keeps a claimed job alive and optionally records progress. */
  heartbeat(id: string, progress?: JobProgress): Promise<HeartbeatResult>;
  complete(id: string, result: TResult): Promise<Job<TPayload, TResult> | undefined>;
  fail(id: string, error: string, opts?: FailOptions): Promise<Job<TPayload, TResult> | undefined>;
  cancel(id: string): Promise<Job<TPayload, TResult> | undefined>;
  /**
   * Re-queues running jobs whose last heartbeat is older than `staleAfterMs` (or fails them when
   * they are out of attempts). Returns how many jobs it touched.
   */
  recoverStale(staleAfterMs: number): Promise<number>;
  /**
   * Changes made through this queue instance. Other processes sharing the same store do not emit
   * here; use `waitForJob` (polling) across processes.
   */
  subscribe(listener: JobListener<TPayload, TResult>): () => void;
  close(): Promise<void>;
}

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 1000;

export function listLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError('limit must be a positive integer');
  return Math.min(limit, MAX_LIST_LIMIT);
}

export function maxAttemptsOf(opts: EnqueueOptions | undefined): number {
  const n = opts?.maxAttempts ?? 1;
  if (!Number.isInteger(n) || n < 1) throw new RangeError('maxAttempts must be a positive integer');
  return n;
}

export const STALE_ERROR = 'The worker stopped responding and the job has no attempts left.';
export const CANCELLED_ERROR = 'Cancelled.';
