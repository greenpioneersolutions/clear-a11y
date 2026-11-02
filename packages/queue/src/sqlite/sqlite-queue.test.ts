import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runQueueContract } from '../testing/index.js';
import type { ContractPayload, ContractResult } from '../testing/index.js';
import { STALE_ERROR } from '../types.js';
import { SCHEMA_VERSION } from './migrations.js';
import { createSqliteQueue } from './sqlite-queue.js';

const dirs: string[] = [];
const tmpFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'clear-a11y-queue-'));
  dirs.push(dir);
  return join(dir, 'nested', 'queue.db');
};
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

let path = '';
runQueueContract(
  'sqlite (temp file)',
  () => {
    path = tmpFile();
    return createSqliteQueue<ContractPayload, ContractResult>({ path });
  },
  {
    reopen: async (q) => {
      await q.close();
      return createSqliteQueue<ContractPayload, ContractResult>({ path });
    },
  },
);

runQueueContract('sqlite (:memory:)', () =>
  createSqliteQueue<ContractPayload, ContractResult>({ path: ':memory:' }),
);

describe('createSqliteQueue', () => {
  it('uses WAL mode and records the schema version', async () => {
    const file = tmpFile();
    const q = await createSqliteQueue({ path: file });
    await q.close();
    const db = new DatabaseSync(file);
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual(
      expect.objectContaining({ journal_mode: 'wal' }),
    );
    expect(db.prepare('PRAGMA user_version').get()).toEqual(
      expect.objectContaining({ user_version: SCHEMA_VERSION }),
    );
    db.close();
  });

  it('re-queues jobs left running by a dead process when it reopens', async () => {
    const file = tmpFile();
    let clock = 1_000_000;
    const now = () => clock;
    const first = await createSqliteQueue({ path: file, now });
    const retry = await first.enqueue({ n: 1 }, { maxAttempts: 3 });
    const last = await first.enqueue({ n: 2 });
    await first.claim('w-dead');
    await first.claim('w-dead');
    await first.close(); // the process "dies" with both jobs running

    clock += 10_000;
    const early = await createSqliteQueue({ path: file, now, recoverStaleAfterMs: 30_000 });
    expect((await early.get(retry.id))?.status).toBe('running');
    await early.close();

    clock += 60_000;
    const later = await createSqliteQueue({ path: file, now, recoverStaleAfterMs: 30_000 });
    expect(await later.get(retry.id)).toMatchObject({ status: 'queued', attempts: 1 });
    expect(await later.get(last.id)).toMatchObject({ status: 'failed', error: STALE_ERROR });
    await later.close();
  });

  it('keeps queues with different names apart in one file', async () => {
    const file = tmpFile();
    const a = await createSqliteQueue({ path: file, name: 'a' });
    const b = await createSqliteQueue({ path: file, name: 'b' });
    const job = await a.enqueue({ n: 1 });
    expect(await b.get(job.id)).toBeUndefined();
    expect(await b.claim('w')).toBeUndefined();
    expect((await a.claim('w'))?.id).toBe(job.id);
    await a.close();
    await b.close();
  });

  it('lets two connections to one file claim without double-claiming', async () => {
    const file = tmpFile();
    const a = await createSqliteQueue({ path: file });
    const b = await createSqliteQueue({ path: file });
    for (let n = 0; n < 20; n++) await a.enqueue({ n });
    const claims = await Promise.all(
      Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).claim(`w${i}`)),
    );
    const ids = claims.filter((j) => j !== undefined).map((j) => j.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    await a.close();
    await b.close();
  });

  it('refuses a database written by a newer schema', async () => {
    const file = tmpFile();
    (await createSqliteQueue({ path: file })).close();
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    db.close();
    await expect(createSqliteQueue({ path: file })).rejects.toThrow(/newer/);
  });
});
