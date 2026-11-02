import { runQueueContract } from '../testing/index.js';
import type { ContractPayload, ContractResult } from '../testing/index.js';
import { createMemoryQueue } from './memory-queue.js';

runQueueContract('memory', async () => createMemoryQueue<ContractPayload, ContractResult>());

describe('createMemoryQueue', () => {
  it('returns copies, so callers cannot mutate stored jobs', async () => {
    const q = createMemoryQueue<{ tags: string[] }>();
    const job = await q.enqueue({ tags: ['a'] });
    job.payload.tags.push('b');
    expect((await q.get(job.id))?.payload.tags).toEqual(['a']);
  });

  it('rejects bad options', async () => {
    const q = createMemoryQueue();
    await expect(q.enqueue({}, { maxAttempts: 0 })).rejects.toThrow(RangeError);
  });
});
