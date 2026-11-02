import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CalibrationAnswer,
  CalibrationExport,
  FindingView,
  FocusPathView,
  ReviewItem,
  ScanRecord,
  Target,
} from '../shared/api-types.js';
import { INVOKE_CHANNELS } from '../shared/channels.js';
import { IPC_SCHEMAS } from '../shared/ipc-schemas.js';
import { createHarness, stubFns, until, type Harness } from '../../test/support/services.js';
import { dispatchIpc, registerIpc, type IpcMainLike } from './ipc.js';

async function call<T>(h: Harness, channel: string, payload?: unknown): Promise<T> {
  const res = await dispatchIpc(h.handlers, channel, payload);
  if (!res.ok) throw new Error(res.error);
  return res.value as T;
}

describe('IPC schemas', () => {
  it('covers every channel', () => {
    expect(Object.keys(IPC_SCHEMAS).sort()).toEqual([...INVOKE_CHANNELS].sort());
  });

  it.each([
    ['targets:add', { kind: 'ftp', value: 'x' }],
    ['targets:add', { kind: 'url', value: '' }],
    ['targets:add', { kind: 'url', value: 'https://a.test', extra: 1 }],
    ['targets:remove', { id: '../../etc/passwd' }],
    ['scans:start', { targetIds: [] }],
    ['scans:start', { targetIds: 'abc' }],
    ['findings:list', { scanId: 'not-an-id' }],
    ['findings:list', { scanId: '00000000-0000-4000-8000-000000000000', tier: 'critical' }],
    [
      'review:answer',
      { scanId: '00000000-0000-4000-8000-000000000000', findingId: 'f', answer: 'maybe' },
    ],
    ['settings:set', { ai: { provider: 'claude-subscription' } }],
    ['settings:set', { ai: { provider: 'anthropic', apiKey: 'sk-ant-secret' } }],
    ['settings:set', { ai: { provider: 'anthropic', apiKeyEnv: 'sk-ant-secret-value!' } }],
    ['settings:set', { ai: { provider: 'ollama', baseUrl: 'file:///etc/passwd' } }],
    ['providers:envStatus', { names: ['A; rm -rf /'] }],
    ['app:info', { anything: true }],
  ])('%s rejects %j', (channel, payload) => {
    expect(IPC_SCHEMAS[channel as keyof typeof IPC_SCHEMAS].safeParse(payload).success).toBe(false);
  });
});

describe('dispatchIpc', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => h.close());

  it('refuses unknown channels and invalid payloads before any handler runs', async () => {
    expect(await dispatchIpc(h.handlers, 'fs:readFile', '/etc/passwd')).toEqual({
      ok: false,
      error: 'Unknown request.',
    });
    const bad = await dispatchIpc(h.handlers, 'targets:add', { kind: 'url', value: 42 });
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.error).toMatch(/^Invalid request: value:/);
    expect(await h.services.targets.list()).toEqual([]);
  });

  it('returns handler errors as plain messages', async () => {
    const res = await dispatchIpc(h.handlers, 'targets:add', {
      kind: 'url',
      value: 'javascript:alert(1)',
    });
    expect(res).toEqual({
      ok: false,
      error: 'Only http:// and https:// addresses can be scanned.',
    });
  });

  it('adds, lists and removes targets (URLs and repo folders)', async () => {
    const site = await call<Target>(h, 'targets:add', {
      kind: 'url',
      value: 'https://example.com/a#x',
    });
    expect(site).toMatchObject({
      kind: 'url',
      value: 'https://example.com/a',
      label: 'example.com/a',
    });
    const repoDir = join(h.dir, 'my-repo');
    await mkdir(repoDir);
    h.dialogs.nextFolder = repoDir;
    const picked = await call<string | null>(h, 'targets:pickFolder');
    const repo = await call<Target>(h, 'targets:add', { kind: 'repo', value: picked });
    expect(repo).toMatchObject({ kind: 'repo', value: repoDir, label: 'my-repo' });
    await expect(call(h, 'targets:add', { kind: 'repo', value: 'relative/path' })).rejects.toThrow(
      /absolute path/,
    );
    expect(await call<Target[]>(h, 'targets:list')).toHaveLength(2);
    await call(h, 'targets:remove', { id: site.id });
    expect((await call<Target[]>(h, 'targets:list')).map((t) => t.id)).toEqual([repo.id]);
  });

  it('runs a scan through the queue and serves findings, focus paths, report and review', async () => {
    const target = await call<Target>(h, 'targets:add', {
      kind: 'url',
      value: 'http://127.0.0.1:9/p',
    });
    const [started] = await call<ScanRecord[]>(h, 'scans:start', { targetIds: [target.id] });
    expect(started).toMatchObject({ status: 'queued', target: 'http://127.0.0.1:9/p' });
    const done = await until(async () => {
      const s = await call<ScanRecord>(h, 'scans:get', { id: started?.id });
      return s.status === 'succeeded' ? s : undefined;
    });
    expect(done.summary?.total).toBe(4);
    expect(h.events.some((e) => e.channel === 'scans:progress')).toBe(true);
    expect((await call<ScanRecord[]>(h, 'scans:list')).map((s) => s.id)).toEqual([done.id]);

    const findings = await call<FindingView[]>(h, 'findings:list', { scanId: done.id });
    expect(findings.map((f) => f.tier)).toEqual([
      'violation',
      'likely',
      'needs-review',
      'needs-review',
    ]);
    expect(findings[0]?.criteria[0]).toEqual({
      sc: '1.1.1',
      title: 'Non-text Content',
      level: 'A',
    });
    expect(findings[0]?.screenshotUri).toMatch(/^data:image\/png;base64,/);
    const onlyLikely = await call<FindingView[]>(h, 'findings:list', {
      scanId: done.id,
      tier: 'likely',
    });
    expect(onlyLikely).toHaveLength(1);

    const paths = await call<FocusPathView[]>(h, 'report:focusPaths', { scanId: done.id });
    expect(paths).toHaveLength(1);
    expect(paths[0]?.layout?.arrows.some((a) => a.backward)).toBe(true);

    const html = await call<string>(h, 'report:html', { scanId: done.id });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Content-Security-Policy');

    const queue = await call<ReviewItem[]>(h, 'review:queue', { scanId: done.id });
    expect(queue).toHaveLength(2);
    expect(queue[0]?.answer).toBeUndefined();
    const saved = await call<CalibrationAnswer>(h, 'review:answer', {
      scanId: done.id,
      findingId: queue[0]?.findingId,
      answer: 'no',
      note: '  The footer has a skip link.  ',
    });
    expect(saved).toMatchObject({
      answer: 'no',
      note: 'The footer has a skip link.',
      ruleId: queue[0]?.ruleId,
      tierAtTime: 'needs-review',
      appVersion: '0.0.0-test',
    });
    // Answering again replaces the earlier answer.
    await call(h, 'review:answer', {
      scanId: done.id,
      findingId: queue[0]?.findingId,
      answer: 'yes',
    });
    const again = await call<ReviewItem[]>(h, 'review:queue', { scanId: done.id });
    expect(again[0]?.answer?.answer).toBe('yes');

    // Only needs-review findings of that scan can be answered.
    await expect(
      call(h, 'review:answer', { scanId: done.id, findingId: findings[0]?.id, answer: 'yes' }),
    ).rejects.toThrow(/not part of this scan/);

    const exported = await call<{ saved: boolean; count: number }>(h, 'review:export');
    expect(exported).toMatchObject({ saved: true, count: 1 });
    const file = JSON.parse(h.dialogs.saved[0]?.content ?? '{}') as CalibrationExport;
    expect(file).toMatchObject({ format: 'clear-a11y-calibration', version: 1 });
    expect(file.answers[0]).toMatchObject({
      answer: 'yes',
      engine: queue[0]?.engine,
      wcag: queue[0]?.wcag,
    });
  });

  it('snapshots settings into the job config (env var name only, provider none sends no ai section)', async () => {
    const fns = stubFns();
    await h.close();
    h = await createHarness({ fns });
    const t = await call<Target>(h, 'targets:add', { kind: 'url', value: 'http://127.0.0.1:9/' });
    await call(h, 'scans:start', { targetIds: [t.id] });
    await until(async () => fns.calls.length > 0);
    expect(fns.calls[0]?.config).toEqual({ crawl: { enabled: false, maxPages: 10 } });

    await call(h, 'settings:set', {
      ai: { provider: 'anthropic', apiKeyEnv: 'MY_ANTHROPIC_KEY' },
      scan: { crawl: true, maxPages: 3 },
    });
    await call(h, 'scans:start', { targetIds: [t.id] });
    await until(async () => fns.calls.length > 1);
    expect(fns.calls[1]?.config).toEqual({
      crawl: { enabled: true, maxPages: 3 },
      ai: { provider: 'anthropic', apiKeyEnv: 'MY_ANTHROPIC_KEY' },
    });
  });

  it('reports results only for finished scans, and cancels queued ones', async () => {
    await h.close();
    h = await createHarness({ startWorker: false }); // no worker: jobs stay queued
    const t = await call<Target>(h, 'targets:add', { kind: 'url', value: 'http://127.0.0.1:9/' });
    const [job] = await call<ScanRecord[]>(h, 'scans:start', { targetIds: [t.id] });
    await expect(call(h, 'findings:list', { scanId: job?.id })).rejects.toThrow(/is queued/);
    const cancelled = await call<ScanRecord>(h, 'scans:cancel', { id: job?.id });
    expect(cancelled.status).toBe('cancelled');
    await expect(
      call(h, 'scans:get', { id: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toThrow(/no longer exists/);
  });
});

describe('registerIpc', () => {
  it('registers every channel and refuses requests from frames that are not the app', async () => {
    const h = await createHarness({ startWorker: false });
    try {
      const listeners = new Map<string, Parameters<IpcMainLike['handle']>[1]>();
      registerIpc(
        { handle: (channel, listener) => listeners.set(channel, listener) },
        h.handlers,
        (url) => url.startsWith('clear-a11y://app/'),
      );
      expect([...listeners.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort());
      const list = listeners.get('targets:list');
      expect(
        await list?.({ senderFrame: { url: 'clear-a11y://app/index.html#/targets' } }),
      ).toEqual({
        ok: true,
        value: [],
      });
      expect(await list?.({ senderFrame: { url: 'about:srcdoc' } })).toMatchObject({ ok: false });
      expect(await list?.({ senderFrame: { url: 'https://evil.example/' } })).toMatchObject({
        ok: false,
      });
      expect(await list?.({ senderFrame: null })).toMatchObject({ ok: false });
      expect(
        await list?.({ senderFrame: { url: 'clear-a11y://app/index.html' } }, undefined, 'extra'),
      ).toMatchObject({ ok: false });
    } finally {
      await h.close();
    }
  });
});
