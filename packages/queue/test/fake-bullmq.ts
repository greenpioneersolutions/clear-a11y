import type { BullJobLike, BullModuleLike, BullQueueLike, BullWorkerLike } from '../src/index.js';

/**
 * In-memory stand-in for the parts of BullMQ the adapter uses: add/getJob/getJobs, manual
 * `getNextJob` with lock tokens, moveToCompleted/moveToFailed (with BullMQ's retry rule:
 * retry while `attemptsMade + 1 < attempts` unless the error is an UnrecoverableError).
 * Not a Redis emulator; it exists to test the adapter's mapping without a server.
 */
type State = 'waiting' | 'active' | 'completed' | 'failed';

class UnrecoverableError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UnrecoverableError';
  }
}

interface Store {
  jobs: Map<string, FakeJob>;
  seq: number;
}

class FakeJob implements BullJobLike {
  state: State = 'waiting';
  lockToken?: string;
  createdSeq: number;
  waitSeq: number;
  timestamp = Date.now();
  processedOn?: number;
  finishedOn?: number;
  attemptsMade = 0;
  attemptsStarted = 0;
  progress: unknown = 0;
  returnvalue: unknown = null;
  failedReason?: string;

  constructor(
    private readonly store: Store,
    public id: string,
    public data: unknown,
    public opts: { attempts?: number },
  ) {
    this.createdSeq = store.seq++;
    this.waitSeq = this.createdSeq;
  }

  private checkLock(token: string) {
    if (this.state !== 'active' || token !== this.lockToken) {
      throw new Error(`Missing lock for job ${this.id}`);
    }
  }

  async updateData(data: never) {
    this.data = structuredClone(data);
  }
  async updateProgress(progress: never) {
    this.progress = structuredClone(progress);
  }
  async extendLock(token: string) {
    this.checkLock(token);
    return 1;
  }
  async moveToCompleted(value: never, token: string) {
    this.checkLock(token);
    this.state = 'completed';
    this.returnvalue = structuredClone(value);
    this.attemptsMade++;
    this.finishedOn = Date.now();
    this.lockToken = undefined;
  }
  async moveToFailed(err: Error, token: string) {
    this.checkLock(token);
    this.failedReason = err.message;
    const retry =
      this.attemptsMade + 1 < (this.opts.attempts ?? 1) && err.name !== 'UnrecoverableError';
    this.attemptsMade++;
    this.lockToken = undefined;
    if (retry) {
      this.state = 'waiting';
      this.waitSeq = this.store.seq++;
    } else {
      this.state = 'failed';
      this.finishedOn = Date.now();
    }
  }
  async getState() {
    return this.state;
  }
}

export interface FakeBullmq extends BullModuleLike {
  store: Store;
  closed: { queues: number; workers: number };
}

export function createFakeBullmq(): FakeBullmq {
  const store: Store = { jobs: new Map(), seq: 0 };
  const closed = { queues: 0, workers: 0 };

  class Queue implements BullQueueLike {
    async add(_name: string, data: never, opts?: never) {
      const o = (opts ?? {}) as { jobId?: string; attempts?: number };
      const id = o.jobId ?? String(store.seq);
      const job = new FakeJob(store, id, structuredClone(data), { attempts: o.attempts });
      store.jobs.set(id, job);
      return job;
    }
    async getJob(id: string) {
      return store.jobs.get(id);
    }
    async getJobs(types?: never, start = 0, end = -1, asc = false) {
      const wanted = (types ?? []) as string[];
      const list = [...store.jobs.values()]
        .filter((j) => wanted.includes(j.state))
        .sort((a, b) => (asc ? a.createdSeq - b.createdSeq : b.createdSeq - a.createdSeq));
      return list.slice(start, end < 0 ? undefined : end + 1);
    }
    async close() {
      closed.queues++;
    }
  }

  class Worker implements BullWorkerLike {
    async getNextJob(token: string) {
      const next = [...store.jobs.values()]
        .filter((j) => j.state === 'waiting')
        .sort((a, b) => a.waitSeq - b.waitSeq)[0];
      if (!next) return undefined;
      next.state = 'active';
      next.lockToken = token;
      next.attemptsStarted++;
      next.processedOn = Date.now();
      return next;
    }
    async close() {
      closed.workers++;
    }
  }

  return { Queue, Worker, UnrecoverableError, store, closed } as unknown as FakeBullmq;
}
