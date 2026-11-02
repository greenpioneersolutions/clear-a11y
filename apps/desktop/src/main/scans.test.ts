import { createHarness, stubFns, until } from '../../test/support/services.js';
import type { ScanRecord, Target } from '../shared/api-types.js';

describe('ScanService', () => {
  it('cancels a running scan: the runner gets an aborted signal and no result is kept', async () => {
    const fns = stubFns({ delayMs: 5_000 });
    const h = await createHarness({ fns });
    try {
      const t: Target = await h.services.targets.add({ kind: 'url', value: 'http://127.0.0.1:9/' });
      const [job] = await h.services.scans.start([t]);
      await until(async () => (await h.services.scans.get(job?.id as string)).status === 'running');
      const cancelled = await h.services.scans.cancel(job?.id as string);
      expect(cancelled.status).toBe('cancelled');
      await until(async () => {
        const call = fns.calls[0] as { signal?: AbortSignal } | undefined;
        return call?.signal?.aborted;
      });
      const after = await h.services.scans.get(job?.id as string);
      expect(after.status).toBe('cancelled');
      expect(after.summary).toBeUndefined();
      const statuses = h.events
        .filter((e) => e.channel === 'scans:progress')
        .map((e) => (e.data as ScanRecord).status);
      expect(statuses).toContain('running');
      expect(statuses.at(-1)).toBe('cancelled');
    } finally {
      await h.close();
    }
  });

  it('records a failed scan with its reason', async () => {
    const h = await createHarness({ fns: stubFns({ fail: 'net::ERR_CONNECTION_REFUSED' }) });
    try {
      const t = await h.services.targets.add({ kind: 'url', value: 'http://127.0.0.1:9/' });
      const [job] = await h.services.scans.start([t]);
      const failed = await until(async () => {
        const s = await h.services.scans.get(job?.id as string);
        return s.status === 'failed' ? s : undefined;
      });
      expect(failed.error).toBe('net::ERR_CONNECTION_REFUSED');
    } finally {
      await h.close();
    }
  });

  it('scans repo folders with scanRepo', async () => {
    const fns = stubFns();
    const h = await createHarness({ fns });
    try {
      const t = await h.services.targets.add({ kind: 'repo', value: h.dir });
      const [job] = await h.services.scans.start([t]);
      await until(
        async () => (await h.services.scans.get(job?.id as string)).status === 'succeeded',
      );
      expect(fns.calls[0]).toMatchObject({ path: h.dir, toolVersion: '0.0.0-test' });
    } finally {
      await h.close();
    }
  });

  it('keeps scan history across restarts with SQLite', async () => {
    const h = await createHarness();
    const t = await h.services.targets.add({ kind: 'url', value: 'http://127.0.0.1:9/' });
    const [job] = await h.services.scans.start([t]);
    await until(async () => (await h.services.scans.get(job?.id as string)).status === 'succeeded');
    expect(h.services.info.storage).toBe('sqlite');
    const dataDir = h.services.paths.dataDir;
    await h.services.close();
    const again = await createHarness({ dataDir });
    try {
      expect((await again.services.scans.list()).map((s) => s.id)).toEqual([job?.id]);
      expect((await again.services.targets.list()).map((x) => x.id)).toEqual([t.id]);
      const { result } = await again.services.scans.result(job?.id as string);
      expect(result.findings).toHaveLength(4);
    } finally {
      await again.close();
    }
  });

  it('falls back to an in-memory queue (and JSON calibration) when SQLite is unavailable', async () => {
    const h = await createHarness({ storage: 'memory' });
    try {
      expect(h.services.info.storage).toBe('memory');
      expect(h.services.calibration.kind).toBe('json');
      const t = await h.services.targets.add({ kind: 'url', value: 'http://127.0.0.1:9/' });
      const [job] = await h.services.scans.start([t]);
      await until(
        async () => (await h.services.scans.get(job?.id as string)).status === 'succeeded',
      );
    } finally {
      await h.close();
    }
  });
});
