import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { JobEmitter } from '../events.js';
import {
  JOB_STATUSES,
  listLimit,
  maxAttemptsOf,
  STALE_ERROR,
  type EnqueueOptions,
  type FailOptions,
  type Job,
  type JobEventType,
  type JobProgress,
  type JobQueue,
  type JobStatus,
  type ListOptions,
} from '../types.js';
import { migrate } from './migrations.js';

export interface SqliteQueueOptions {
  /** Database file. `:memory:` works for tests. Parent folders are created. */
  path: string;
  /** Queue name, so one database file can hold several queues. Default `default`. */
  name?: string;
  /**
   * On open, running jobs whose heartbeat is older than this are re-queued (or failed when out of
   * attempts): their worker died with the previous process. Default 30 s. `false` skips it.
   */
  recoverStaleAfterMs?: number | false;
  /** How long a write waits for another process's lock before failing. Default 5 s. */
  busyTimeoutMs?: number;
  /** Clock, for tests. */
  now?: () => number;
}

interface Row {
  id: string;
  status: string;
  payload: string;
  result: string | null;
  error: string | null;
  progress: string | null;
  attempts: number;
  max_attempts: number;
  worker_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const COLUMNS =
  'id, status, payload, result, error, progress, attempts, max_attempts, worker_id, created_at, updated_at, started_at, finished_at';

function toStatus(value: string): JobStatus {
  if ((JOB_STATUSES as readonly string[]).includes(value)) return value as JobStatus;
  throw new Error(`unknown job status "${value}" in queue database`);
}

export function rowToJob<P, R>(row: Row): Job<P, R> {
  const job: Job<P, R> = {
    id: row.id,
    status: toStatus(row.status),
    payload: JSON.parse(row.payload) as P,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.result !== null) job.result = JSON.parse(row.result) as R;
  if (row.error !== null) job.error = row.error;
  if (row.progress !== null) job.progress = JSON.parse(row.progress) as JobProgress;
  if (row.worker_id !== null) job.workerId = row.worker_id;
  if (row.started_at !== null) job.startedAt = row.started_at;
  if (row.finished_at !== null) job.finishedAt = row.finished_at;
  return job;
}

/**
 * SQLite queue on Node's built-in `node:sqlite` (no native addon, nothing downloaded at install).
 * WAL mode; claims are one atomic `UPDATE ... RETURNING`, so several workers (even in several
 * processes sharing the file) never take the same job. Survives restarts.
 */
export async function createSqliteQueue<TPayload = unknown, TResult = unknown>(
  options: SqliteQueueOptions,
): Promise<JobQueue<TPayload, TResult>> {
  // Imported lazily so loading this package never requires node:sqlite (desktop fallback,
  // older runtimes) unless the SQLite queue is actually used.
  const { DatabaseSync: Database } = await import('node:sqlite');
  if (options.path !== ':memory:') mkdirSync(dirname(options.path), { recursive: true });
  const db: DatabaseSync = new Database(options.path);
  const name = options.name ?? 'default';
  const now = options.now ?? Date.now;
  const iso = () => new Date(now()).toISOString();
  const emitter = new JobEmitter<TPayload, TResult>();
  let closed = false;

  try {
    db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(options.busyTimeoutMs ?? 5000))}`);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }

  const one = (sql: string, ...params: SQLInputValue[]): Job<TPayload, TResult> | undefined => {
    const row = db.prepare(sql).get(...params) as Row | undefined;
    return row ? rowToJob<TPayload, TResult>(row) : undefined;
  };
  const byId = (id: string) =>
    one(`SELECT ${COLUMNS} FROM jobs WHERE queue = ? AND id = ?`, name, id);
  const live = () => {
    if (closed) throw new Error('queue is closed');
  };
  const emit = (type: JobEventType, job: Job<TPayload, TResult> | undefined) => {
    emitter.emit(type, job);
    return job;
  };

  async function recoverStale(staleAfterMs: number): Promise<number> {
    live();
    const cutoff = now() - staleAfterMs;
    const at = iso();
    const stmt = db.prepare(
      `UPDATE jobs SET
         status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
         error = CASE WHEN attempts < max_attempts THEN error ELSE ? END,
         finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE ? END,
         worker_id = CASE WHEN attempts < max_attempts THEN NULL ELSE worker_id END,
         updated_at = ?
       WHERE queue = ? AND status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at <= ?)
       RETURNING ${COLUMNS}`,
    );
    const rows = stmt.all(STALE_ERROR, at, at, name, cutoff) as unknown as Row[];
    for (const row of rows) {
      const job = rowToJob<TPayload, TResult>(row);
      emit(job.status === 'queued' ? 'requeued' : 'failed', job);
    }
    return rows.length;
  }

  if (options.recoverStaleAfterMs !== false) {
    await recoverStale(options.recoverStaleAfterMs ?? 30_000);
  }

  return {
    kind: 'sqlite',
    async enqueue(payload: TPayload, opts?: EnqueueOptions) {
      live();
      const at = iso();
      return emit(
        'enqueued',
        one(
          `INSERT INTO jobs (id, queue, status, payload, max_attempts, created_at, updated_at)
           VALUES (?, ?, 'queued', ?, ?, ?, ?) RETURNING ${COLUMNS}`,
          randomUUID(),
          name,
          JSON.stringify(payload),
          maxAttemptsOf(opts),
          at,
          at,
        ),
      ) as Job<TPayload, TResult>;
    },
    async get(id: string) {
      live();
      return byId(id);
    },
    async list(opts: ListOptions = {}) {
      live();
      const limit = listLimit(opts.limit);
      const rows = (opts.status
        ? db
            .prepare(
              `SELECT ${COLUMNS} FROM jobs WHERE queue = ? AND status = ? ORDER BY seq DESC LIMIT ?`,
            )
            .all(name, opts.status, limit)
        : db
            .prepare(`SELECT ${COLUMNS} FROM jobs WHERE queue = ? ORDER BY seq DESC LIMIT ?`)
            .all(name, limit)) as unknown as Row[];
      return rows.map((r) => rowToJob<TPayload, TResult>(r));
    },
    async claim(workerId: string) {
      live();
      const at = iso();
      return emit(
        'claimed',
        one(
          `UPDATE jobs SET status = 'running', attempts = attempts + 1, worker_id = ?,
             started_at = ?, updated_at = ?, heartbeat_at = ?, finished_at = NULL, error = NULL
           WHERE seq = (
             SELECT seq FROM jobs WHERE queue = ? AND status = 'queued' ORDER BY seq LIMIT 1
           ) AND status = 'queued'
           RETURNING ${COLUMNS}`,
          workerId,
          at,
          at,
          now(),
          name,
        ),
      );
    },
    async heartbeat(id: string, progress?: JobProgress) {
      live();
      const job = progress
        ? one(
            `UPDATE jobs SET heartbeat_at = ?, progress = ?, updated_at = ?
             WHERE queue = ? AND id = ? AND status = 'running' RETURNING ${COLUMNS}`,
            now(),
            JSON.stringify(progress),
            iso(),
            name,
            id,
          )
        : one(
            `UPDATE jobs SET heartbeat_at = ?
             WHERE queue = ? AND id = ? AND status = 'running' RETURNING ${COLUMNS}`,
            now(),
            name,
            id,
          );
      if (job) {
        if (progress) emit('progress', job);
        return { cancelled: false };
      }
      return { cancelled: byId(id)?.status === 'cancelled' };
    },
    async complete(id: string, result: TResult) {
      live();
      const at = iso();
      const job = one(
        `UPDATE jobs SET status = 'succeeded', result = ?, finished_at = ?, updated_at = ?
         WHERE queue = ? AND id = ? AND status = 'running' RETURNING ${COLUMNS}`,
        JSON.stringify(result ?? null),
        at,
        at,
        name,
        id,
      );
      return job ? emit('succeeded', job) : byId(id);
    },
    async fail(id: string, error: string, opts: FailOptions = {}) {
      live();
      const at = iso();
      const retry = opts.retry ? 1 : 0;
      const job = one(
        `UPDATE jobs SET
           status = CASE WHEN ? = 1 AND attempts < max_attempts THEN 'queued' ELSE 'failed' END,
           finished_at = CASE WHEN ? = 1 AND attempts < max_attempts THEN NULL ELSE ? END,
           worker_id = CASE WHEN ? = 1 AND attempts < max_attempts THEN NULL ELSE worker_id END,
           error = ?, updated_at = ?
         WHERE queue = ? AND id = ? AND status = 'running' RETURNING ${COLUMNS}`,
        retry,
        retry,
        at,
        retry,
        error,
        at,
        name,
        id,
      );
      if (!job) return byId(id);
      return emit(job.status === 'queued' ? 'requeued' : 'failed', job);
    },
    async cancel(id: string) {
      live();
      const at = iso();
      const job = one(
        `UPDATE jobs SET status = 'cancelled', finished_at = ?, updated_at = ?
         WHERE queue = ? AND id = ? AND status IN ('queued', 'running') RETURNING ${COLUMNS}`,
        at,
        at,
        name,
        id,
      );
      return job ? emit('cancelled', job) : byId(id);
    },
    recoverStale,
    subscribe(listener) {
      return emitter.subscribe(listener);
    },
    async close() {
      if (closed) return;
      closed = true;
      emitter.clear();
      db.close();
    },
  };
}
