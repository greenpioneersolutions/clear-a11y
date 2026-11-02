import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { processJobs, waitForJob } from '../process.js';
import { STALE_ERROR, type JobEvent, type JobQueue } from '../types.js';

export interface ContractPayload {
  n: number;
  nested?: { tags: string[] };
}
export interface ContractResult {
  doubled: number;
}
export type ContractQueue = JobQueue<ContractPayload, ContractResult>;

export interface QueueContractOptions {
  /** Close the queue and open a new one on the same store (persistence and restart recovery). */
  reopen?: (queue: ContractQueue) => Promise<ContractQueue>;
  /** `recoverStale(0)` re-queues running jobs. False for BullMQ, which has its own stalled checker. */
  staleRecovery?: boolean;
  /** Skip the whole suite (for example, no Redis available). A string is logged as the reason. */
  skip?: boolean | string;
}

/**
 * The behaviour every `JobQueue` implementation must have. Call it from a Vitest test file:
 *
 * ```ts
 * runQueueContract('sqlite', () => createSqliteQueue({ path: tmpFile() }));
 * ```
 */
export function runQueueContract(
  name: string,
  create: () => Promise<ContractQueue>,
  options: QueueContractOptions = {},
): void {
  if (options.skip) {
    describe.skip(`JobQueue contract: ${name}`, () => {
      it(typeof options.skip === 'string' ? options.skip : 'skipped', () => undefined);
    });
    if (typeof options.skip === 'string') console.info(`[queue contract] ${name}: ${options.skip}`);
    return;
  }

  describe(`JobQueue contract: ${name}`, () => {
    let queue: ContractQueue;
    beforeEach(async () => {
      queue = await create();
    });
    afterEach(async () => {
      await queue.close();
    });

    it('enqueues a queued job and reads it back', async () => {
      const job = await queue.enqueue({ n: 1, nested: { tags: ['a', 'b'] } });
      expect(job).toMatchObject({ status: 'queued', attempts: 0, maxAttempts: 1 });
      expect(job.id).toEqual(expect.any(String));
      expect(Date.parse(job.createdAt)).not.toBeNaN();
      expect(await queue.get(job.id)).toEqual(job);
      expect(await queue.get('no-such-job')).toBeUndefined();
    });

    it('lists newest first, filters by status and honours the limit', async () => {
      const a = await queue.enqueue({ n: 1 });
      const b = await queue.enqueue({ n: 2 });
      const c = await queue.enqueue({ n: 3 });
      expect((await queue.list()).map((j) => j.id)).toEqual([c.id, b.id, a.id]);
      expect((await queue.list({ limit: 2 })).map((j) => j.id)).toEqual([c.id, b.id]);
      await queue.claim('w1');
      expect((await queue.list({ status: 'running' })).map((j) => j.id)).toEqual([a.id]);
      expect((await queue.list({ status: 'queued' })).map((j) => j.id)).toEqual([c.id, b.id]);
      await expect(queue.list({ limit: 0 })).rejects.toThrow();
    });

    it('claims in FIFO order and marks the job running', async () => {
      expect(await queue.claim('w1')).toBeUndefined();
      const first = await queue.enqueue({ n: 1 });
      const second = await queue.enqueue({ n: 2 });
      const claimed = await queue.claim('w1');
      expect(claimed).toMatchObject({
        id: first.id,
        status: 'running',
        attempts: 1,
        workerId: 'w1',
      });
      expect(claimed?.startedAt).toEqual(expect.any(String));
      expect((await queue.claim('w2'))?.id).toBe(second.id);
      expect(await queue.claim('w3')).toBeUndefined();
    });

    it('never gives the same job to two concurrent claims', async () => {
      const ids = new Set<string>();
      for (let n = 0; n < 10; n++) ids.add((await queue.enqueue({ n })).id);
      const claims = await Promise.all(
        Array.from({ length: 20 }, (_, i) => queue.claim(`w${i % 2}`)),
      );
      const got = claims.filter((j) => j !== undefined).map((j) => j.id);
      expect(got).toHaveLength(10);
      expect(new Set(got)).toEqual(ids);
    });

    it('records progress through heartbeat', async () => {
      const job = await queue.enqueue({ n: 1 });
      await queue.claim('w1');
      expect(await queue.heartbeat(job.id, { done: 1, total: 3, message: 'page 1' })).toEqual({
        cancelled: false,
      });
      expect((await queue.get(job.id))?.progress).toEqual({ done: 1, total: 3, message: 'page 1' });
      expect(await queue.heartbeat(job.id)).toEqual({ cancelled: false });
    });

    it('completes a running job with its result, once', async () => {
      const job = await queue.enqueue({ n: 21 });
      await queue.claim('w1');
      const done = await queue.complete(job.id, { doubled: 42 });
      expect(done).toMatchObject({ status: 'succeeded', result: { doubled: 42 } });
      expect(done?.finishedAt).toEqual(expect.any(String));
      const again = await queue.complete(job.id, { doubled: 0 });
      expect(again?.result).toEqual({ doubled: 42 });
      expect(await queue.complete('no-such-job', { doubled: 0 })).toBeUndefined();
    });

    it('does not complete or fail a job that is not running', async () => {
      const job = await queue.enqueue({ n: 1 });
      expect((await queue.complete(job.id, { doubled: 2 }))?.status).toBe('queued');
      expect((await queue.fail(job.id, 'nope'))?.status).toBe('queued');
    });

    it('fails a job with its error message', async () => {
      const job = await queue.enqueue({ n: 1 });
      await queue.claim('w1');
      const failed = await queue.fail(job.id, 'target unreachable');
      expect(failed).toMatchObject({ status: 'failed', error: 'target unreachable' });
      expect(failed?.finishedAt).toEqual(expect.any(String));
    });

    it('retries a failed job until it is out of attempts', async () => {
      const job = await queue.enqueue({ n: 1 }, { maxAttempts: 2 });
      await queue.claim('w1');
      expect(await queue.fail(job.id, 'flaky', { retry: true })).toMatchObject({
        status: 'queued',
        attempts: 1,
      });
      expect(await queue.claim('w2')).toMatchObject({ id: job.id, attempts: 2 });
      expect(await queue.fail(job.id, 'still flaky', { retry: true })).toMatchObject({
        status: 'failed',
        error: 'still flaky',
        attempts: 2,
      });
    });

    it('cancels a queued job so nobody claims it', async () => {
      const job = await queue.enqueue({ n: 1 });
      const cancelled = await queue.cancel(job.id);
      expect(cancelled?.status).toBe('cancelled');
      expect(await queue.claim('w1')).toBeUndefined();
      expect((await queue.get(job.id))?.status).toBe('cancelled');
      expect(await queue.cancel('no-such-job')).toBeUndefined();
    });

    it('cancels a running job: the worker learns it from heartbeat and its result is dropped', async () => {
      const job = await queue.enqueue({ n: 1 });
      await queue.claim('w1');
      expect((await queue.cancel(job.id))?.status).toBe('cancelled');
      expect(await queue.heartbeat(job.id)).toEqual({ cancelled: true });
      expect((await queue.complete(job.id, { doubled: 2 }))?.status).toBe('cancelled');
      expect((await queue.fail(job.id, 'x'))?.status).toBe('cancelled');
      expect((await queue.get(job.id))?.status).toBe('cancelled');
    });

    it('leaves finished jobs alone when cancelled', async () => {
      const job = await queue.enqueue({ n: 1 });
      await queue.claim('w1');
      await queue.complete(job.id, { doubled: 2 });
      expect((await queue.cancel(job.id))?.status).toBe('succeeded');
    });

    it('emits events to subscribers until they unsubscribe', async () => {
      const events: JobEvent<ContractPayload, ContractResult>[] = [];
      const off = queue.subscribe((e) => events.push(e));
      const job = await queue.enqueue({ n: 1 });
      await queue.claim('w1');
      await queue.heartbeat(job.id, { done: 1, total: 1 });
      await queue.complete(job.id, { doubled: 2 });
      off();
      await queue.enqueue({ n: 2 });
      expect(events.map((e) => e.type)).toEqual(['enqueued', 'claimed', 'progress', 'succeeded']);
      expect(events.every((e) => e.job.id === job.id)).toBe(true);
    });

    it('runs jobs through processJobs with concurrency, progress and failures', async () => {
      const ok = await Promise.all([1, 2, 3, 4].map((n) => queue.enqueue({ n })));
      const bad = await queue.enqueue({ n: -1 });
      let running = 0;
      let peak = 0;
      const worker = processJobs(
        queue,
        async (job, ctx) => {
          running++;
          peak = Math.max(peak, running);
          await ctx.report({ done: 0, total: 1 });
          await new Promise((r) => setTimeout(r, 30));
          running--;
          if (job.payload.n < 0) throw new Error('negative input');
          return { doubled: job.payload.n * 2 };
        },
        { concurrency: 2, pollIntervalMs: 10, heartbeatMs: 20 },
      );
      try {
        for (const job of ok) {
          const done = await waitForJob(queue, job.id, { timeoutMs: 5000, intervalMs: 10 });
          expect(done).toMatchObject({
            status: 'succeeded',
            result: { doubled: job.payload.n * 2 },
          });
        }
        expect(await waitForJob(queue, bad.id, { timeoutMs: 5000, intervalMs: 10 })).toMatchObject({
          status: 'failed',
          error: 'negative input',
        });
        expect(peak).toBe(2);
      } finally {
        await worker.stop();
      }
    });

    it('aborts a running handler when its job is cancelled', async () => {
      const job = await queue.enqueue({ n: 1 });
      let aborted = false;
      const worker = processJobs(
        queue,
        (_job, ctx) =>
          new Promise((_resolve, reject) => {
            ctx.signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
        { pollIntervalMs: 10, heartbeatMs: 10 },
      );
      try {
        for (let i = 0; i < 100 && (await queue.get(job.id))?.status !== 'running'; i++) {
          await new Promise((r) => setTimeout(r, 10));
        }
        await queue.cancel(job.id);
        for (let i = 0; i < 100 && !aborted; i++) await new Promise((r) => setTimeout(r, 10));
        expect(aborted).toBe(true);
        expect((await queue.get(job.id))?.status).toBe('cancelled');
      } finally {
        await worker.stop();
      }
    });

    if (options.staleRecovery !== false) {
      it('re-queues running jobs whose worker stopped heart-beating', async () => {
        const retry = await queue.enqueue({ n: 1 }, { maxAttempts: 2 });
        const last = await queue.enqueue({ n: 2 });
        await queue.claim('dead-worker');
        await queue.claim('dead-worker');
        expect(await queue.recoverStale(60_000)).toBe(0);
        await new Promise((r) => setTimeout(r, 5));
        expect(await queue.recoverStale(0)).toBe(2);
        expect(await queue.get(retry.id)).toMatchObject({ status: 'queued', attempts: 1 });
        expect(await queue.get(last.id)).toMatchObject({ status: 'failed', error: STALE_ERROR });
        expect(await queue.claim('w2')).toMatchObject({ id: retry.id, attempts: 2 });
      });
    }

    const reopen = options.reopen;
    if (reopen) {
      it('keeps jobs across a restart and recovers the ones that were running', async () => {
        const done = await queue.enqueue({ n: 1 });
        const running = await queue.enqueue({ n: 2 }, { maxAttempts: 3 });
        const waiting = await queue.enqueue({ n: 3 });
        await queue.claim('w1');
        await queue.complete(done.id, { doubled: 2 });
        await queue.claim('w1');
        queue = await reopen(queue);
        expect(await queue.get(done.id)).toMatchObject({
          status: 'succeeded',
          result: { doubled: 2 },
        });
        expect((await queue.get(waiting.id))?.status).toBe('queued');
        await new Promise((r) => setTimeout(r, 5));
        await queue.recoverStale(0);
        expect(await queue.get(running.id)).toMatchObject({ status: 'queued', attempts: 1 });
        expect((await queue.claim('w2'))?.id).toBe(running.id);
        expect((await queue.claim('w2'))?.id).toBe(waiting.id);
      });
    }
  });
}
