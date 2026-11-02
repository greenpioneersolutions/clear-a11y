import { createFakeBullmq } from '../../test/fake-bullmq.js';
import { runQueueContract } from '../testing/index.js';
import type { ContractPayload, ContractResult } from '../testing/index.js';
import {
  bullJobToJob,
  createBullQueue,
  statusFromBullState,
  type BullJobLike,
} from './bull-queue.js';

const fakeJob = (over: Partial<BullJobLike> = {}): BullJobLike =>
  ({
    id: 'j1',
    data: { payload: { n: 1 } },
    opts: { attempts: 3 },
    timestamp: Date.UTC(2026, 9, 31, 10, 0, 0),
    attemptsMade: 0,
    attemptsStarted: 0,
    progress: 0,
    returnvalue: null,
    ...over,
  }) as BullJobLike;

describe('statusFromBullState', () => {
  it('maps every BullMQ state', () => {
    for (const s of ['waiting', 'prioritized', 'delayed', 'paused', 'waiting-children']) {
      expect(statusFromBullState(s)).toBe('queued');
    }
    expect(statusFromBullState('active')).toBe('running');
    expect(statusFromBullState('completed')).toBe('succeeded');
    expect(statusFromBullState('failed')).toBe('failed');
    expect(statusFromBullState('unknown')).toBeUndefined();
  });
});

describe('bullJobToJob', () => {
  it('maps a waiting job', () => {
    expect(bullJobToJob(fakeJob(), 'waiting')).toEqual({
      id: 'j1',
      status: 'queued',
      payload: { n: 1 },
      attempts: 0,
      maxAttempts: 3,
      createdAt: '2026-10-31T10:00:00.000Z',
      updatedAt: '2026-10-31T10:00:00.000Z',
    });
  });

  it('maps a completed job with result, progress, worker and times', () => {
    const job = bullJobToJob(
      fakeJob({
        data: { payload: { n: 1 }, workerId: 'w1' },
        attemptsStarted: 1,
        attemptsMade: 1,
        processedOn: Date.UTC(2026, 9, 31, 10, 0, 1),
        finishedOn: Date.UTC(2026, 9, 31, 10, 0, 5),
        progress: { done: 2, total: 2 },
        returnvalue: { doubled: 2 },
      }),
      'completed',
    );
    expect(job).toMatchObject({
      status: 'succeeded',
      result: { doubled: 2 },
      progress: { done: 2, total: 2 },
      workerId: 'w1',
      attempts: 1,
      startedAt: '2026-10-31T10:00:01.000Z',
      finishedAt: '2026-10-31T10:00:05.000Z',
      updatedAt: '2026-10-31T10:00:05.000Z',
    });
  });

  it('reports a cancelled marker as cancelled whatever the BullMQ state, without an error', () => {
    const job = bullJobToJob(
      fakeJob({
        data: { payload: {}, cancelledAt: '2026-10-31T11:00:00.000Z' },
        failedReason: 'Cancelled.',
      }),
      'failed',
    );
    expect(job).toMatchObject({ status: 'cancelled', finishedAt: '2026-10-31T11:00:00.000Z' });
    expect(job?.error).toBeUndefined();
  });

  it('ignores numeric progress and unknown states', () => {
    expect(bullJobToJob(fakeJob({ progress: 40 }), 'active')?.progress).toBeUndefined();
    expect(bullJobToJob(fakeJob(), 'unknown')).toBeUndefined();
  });
});

describe('createBullQueue', () => {
  it('needs a url or a connection', async () => {
    const fake = createFakeBullmq();
    await expect(createBullQueue({ loadBullmq: async () => fake })).rejects.toThrow(/url/);
  });

  it('closes the worker and queue it created', async () => {
    const fake = createFakeBullmq();
    const q = await createBullQueue({ connection: {}, loadBullmq: async () => fake });
    await q.enqueue({});
    await q.claim('w1');
    await q.close();
    expect(fake.closed).toEqual({ queues: 1, workers: 1 });
    await expect(q.enqueue({})).rejects.toThrow(/closed/);
  });
});

runQueueContract(
  'bullmq adapter (fake BullMQ)',
  () =>
    createBullQueue<ContractPayload, ContractResult>({
      connection: {},
      loadBullmq: async () => createFakeBullmq(),
    }),
  { staleRecovery: false },
);
