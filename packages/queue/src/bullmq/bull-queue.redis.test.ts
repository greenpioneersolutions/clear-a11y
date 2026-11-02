import { randomUUID } from 'node:crypto';
import { runQueueContract } from '../testing/index.js';
import type { ContractPayload, ContractResult } from '../testing/index.js';
import { createBullQueue } from './bull-queue.js';

// Real Redis is opt-in: contributors and CI never need it. Run with
// `REDIS_URL=redis://localhost:6379 pnpm nx test @clear-a11y/queue`.
const url = process.env['REDIS_URL'];

runQueueContract(
  'bullmq (Redis)',
  () =>
    createBullQueue<ContractPayload, ContractResult>({
      url: url as string,
      // A fresh queue per test so tests don't see each other's jobs.
      name: `clear-a11y-contract-${randomUUID()}`,
      lockDurationMs: 5000,
    }),
  {
    staleRecovery: false,
    skip: url ? false : 'REDIS_URL is not set; skipping the BullMQ contract against Redis.',
  },
);
