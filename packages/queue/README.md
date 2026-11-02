# @clear-a11y/queue

A small job queue for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y) scans: one interface, three implementations.

| Implementation                      | Needs                                           | Use it for                                                 |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| `createMemoryQueue()`               | nothing                                         | tests, or as a fallback when no file can be written        |
| `createSqliteQueue({ path })`       | Node ≥ 22.13 (built-in `node:sqlite`)           | one machine: a laptop, a single container, the desktop app |
| `createBullQueue({ url })` (BullMQ) | Redis, plus the `bullmq` and `ioredis` packages | several workers or containers sharing one queue            |

The SQLite queue uses Node's built-in `node:sqlite`: no native addon to compile and nothing downloaded at install time, so it works offline. `bullmq` and `ioredis` are optional peer dependencies, loaded only when you create a BullMQ queue.

## Install

```sh
npm install @clear-a11y/queue
# only for the BullMQ queue:
npm install bullmq ioredis
```

## Example

```ts
import { createSqliteQueue, processJobs, waitForJob } from '@clear-a11y/queue';

const queue = await createSqliteQueue<{ url: string }, { findings: number }>({
  path: '.clear-a11y/queue.db',
});

const job = await queue.enqueue({ url: 'https://example.com/' }, { maxAttempts: 3 });

const worker = processJobs(
  queue,
  async (job, ctx) => {
    await ctx.report({ done: 0, total: 1, message: job.payload.url });
    // ... do the work; ctx.signal aborts when the job is cancelled
    return { findings: 3 };
  },
  { concurrency: 2 },
);

console.log(await waitForJob(queue, job.id)); // { status: 'succeeded', result: { findings: 3 }, ... }
await worker.stop();
await queue.close();
```

## The interface

```ts
interface JobQueue<TPayload, TResult> {
  readonly kind: string; // 'memory' | 'sqlite' | 'bullmq'
  enqueue(payload, opts?: { maxAttempts?: number }): Promise<Job>;
  get(id): Promise<Job | undefined>;
  list(opts?: { status?: JobStatus; limit?: number }): Promise<Job[]>; // newest first
  claim(workerId): Promise<Job | undefined>; // atomic, oldest queued job first
  heartbeat(id, progress?): Promise<{ cancelled: boolean }>;
  complete(id, result): Promise<Job | undefined>;
  fail(id, error, opts?: { retry?: boolean }): Promise<Job | undefined>;
  cancel(id): Promise<Job | undefined>;
  recoverStale(staleAfterMs): Promise<number>;
  subscribe(listener): () => void; // events from this instance only
  close(): Promise<void>;
}
```

A `Job` has `id`, `status` (`queued`, `running`, `succeeded`, `failed`, `cancelled`), `payload`, `result?`, `error?`, `progress?` (`{ done, total, message? }`), `attempts`, `maxAttempts`, `workerId?` and ISO timestamps (`createdAt`, `updatedAt`, `startedAt?`, `finishedAt?`).

Rules every implementation follows (checked by the shared contract suite):

- **Claims are atomic and FIFO.** Two workers never get the same job.
- **`attempts` counts claims.** `fail(id, error, { retry: true })` re-queues the job while `attempts < maxAttempts`; otherwise it stays `failed`.
- **Cancel** moves a queued or running job to `cancelled`. A running worker learns about it from `heartbeat` (`{ cancelled: true }`); its later `complete` or `fail` is ignored. Finished jobs are left alone.
- **Crashed workers.** `recoverStale(ms)` re-queues running jobs whose last heartbeat is older than `ms`, or fails them (`error` explains) when they are out of attempts. The SQLite queue runs it when it opens (`recoverStaleAfterMs`, default 30 s); `processJobs` runs it periodically. BullMQ uses its own stalled-job checker instead (lock duration `lockDurationMs`).
- **Results should be small.** Store a summary or a reference in `result`; keep large blobs (full reports, screenshots) in files or object storage.

`processJobs(queue, handler, options)` is the worker loop: it claims jobs, heart-beats while the handler runs (`heartbeatMs`, default 5 s), passes `ctx.report(progress)` and an abort `ctx.signal`, and calls `complete`/`fail`. Options: `concurrency`, `signal`, `pollIntervalMs`, `retryOnError`, `recoverStaleAfterMs`, `onError`. `waitForJob(queue, id)` polls until a job finishes and works across processes.

## SQLite details

- WAL mode, `busy_timeout` 5 s, one `UPDATE ... RETURNING` per claim, so several processes can share one file.
- Schema migrations are versioned with `PRAGMA user_version`; a database written by a newer version of this package is refused.
- `name` lets one file hold several queues. `path: ':memory:'` works for tests.

## Scan jobs

`ScanJobPayloadSchema` (Zod) is the payload the Clear A11Y server queues: `targets` (absolute http(s) URLs, 1 to 100), optional `config` (the `clear-a11y.config.json` shape, validated by `ConfigSchema` from `@clear-a11y/core`, unknown top-level keys refused) and an optional `label`. `ScanJobResult` is the summary a scan job stores (`resultRef`, `summary`, `pages`, `errors`).

## Testing your own implementation

```ts
import { runQueueContract } from '@clear-a11y/queue/testing';

runQueueContract('my queue', () => createMyQueue(), {
  reopen: async (q) => {
    await q.close();
    return createMyQueue();
  }, // if it persists
});
```

The contract suite needs Vitest (an optional peer dependency). The BullMQ suite in this repository runs against real Redis only when `REDIS_URL` is set and is skipped otherwise; a fake BullMQ covers the adapter's mapping without Redis.

See the [self-hosting guide](https://github.com/greenpioneersolutions/clear-a11y/blob/main/docs/self-hosting.md) for how the server uses this package.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (self-hosting guide, server API)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/queue
