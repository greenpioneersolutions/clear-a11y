import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  createFinding,
  SCAN_RESULT_SCHEMA_VERSION,
  summarize,
  type ScanResult,
} from '@clear-a11y/core';
import { createMemoryQueue, type ScanJobPayload, type ScanJobResult } from '@clear-a11y/queue';
import type { ScanOptions } from '@clear-a11y/runner';
import request from 'supertest';
import { createApp } from './app.js';
import { loadServerConfig, type ServerConfig } from './config.js';

const TOKEN = 'test-token-0123456789';
const TARGET = 'https://public.test/page.html';
const lookup = async (host: string) => (host === 'public.test' ? ['93.184.216.34'] : ['10.0.0.9']);

function fakeResult(targets: readonly string[]): ScanResult {
  const page = { url: targets[0] as string, state: 'default', viewport: 'desktop' };
  const findings = [
    createFinding({
      ruleId: 'static/image-alt',
      wcag: ['1.1.1'],
      tier: 'violation',
      confidence: 1,
      engine: 'engine-static',
      page,
      target: { selector: '#hero' },
      message: 'Image has no text alternative.',
    }),
    createFinding({
      ruleId: 'visual/contrast',
      wcag: ['1.4.3'],
      tier: 'likely',
      confidence: 0.8,
      engine: 'engine-visual',
      page,
      target: { selector: '#lede' },
      message: 'Low contrast text.',
    }),
  ];
  return {
    schemaVersion: SCAN_RESULT_SCHEMA_VERSION,
    tool: { name: 'clear-a11y', version: '0.0.0' },
    startedAt: '2026-10-31T10:00:00.000Z',
    finishedAt: '2026-10-31T10:00:01.000Z',
    targets: [...targets],
    pages: [{ url: page.url, viewport: 'desktop', states: ['default'] }],
    findings,
    errors: [],
    summary: summarize(findings),
  };
}

describe('server API (fake scan, memory queue)', () => {
  let dir: string;
  let app: INestApplication;
  let config: ServerConfig;
  const scans: ScanOptions[] = [];
  const auth = { Authorization: `Bearer ${TOKEN}` };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'clear-a11y-server-'));
    config = loadServerConfig({
      DATA_DIR: dir,
      CLEAR_A11Y_TOKEN: TOKEN,
      RATE_LIMIT_PER_MINUTE: '1000',
    });
    app = await createApp(config, {
      logger: false,
      lookup,
      queue: createMemoryQueue<ScanJobPayload, ScanJobResult>(),
      scan: async (options) => {
        scans.push(options);
        options.onProgress?.({ done: 0, total: 1, url: options.targets[0] });
        if (options.targets[0]?.includes('boom')) throw new Error('browser crashed');
        return fakeResult(options.targets);
      },
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  async function waitDone(id: string) {
    for (let i = 0; i < 200; i++) {
      const res = await http().get(`/scans/${id}`).set(auth);
      if (['succeeded', 'failed', 'cancelled'].includes(res.body.status)) return res.body;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('scan did not finish');
  }

  it('serves /health without a token', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', queue: 'memory' });
  });

  it('requires the bearer token everywhere else', async () => {
    const res = await http().get('/scans').expect(401);
    expect(res.headers['www-authenticate']).toMatch(/Bearer/);
    await http().get('/scans').set({ Authorization: 'Bearer wrong-token-xxxxxxxx' }).expect(401);
    await http()
      .post('/scans')
      .send({ targets: [TARGET] })
      .expect(401);
  });

  it('runs a scan end to end and serves its results and reports', async () => {
    const created = await http()
      .post('/scans')
      .set(auth)
      .send({ targets: [TARGET], label: 'home' })
      .expect(202);
    expect(created.body).toMatchObject({ status: 'queued', targets: [TARGET], label: 'home' });
    expect(created.headers['location']).toBe(`/scans/${created.body.id}`);

    const done = await waitDone(created.body.id);
    expect(done).toMatchObject({ status: 'succeeded', summary: { total: 2 } });
    expect(scans.at(-1)?.outDir).toBe(join(dir, 'scans', created.body.id));
    expect(scans.at(-1)?.config).toEqual({});

    const results = await http().get(`/scans/${done.id}/results`).set(auth).expect(200);
    expect(results.headers['content-type']).toMatch(/application\/json/);
    expect(results.body.findings).toHaveLength(2);

    const filtered = await http()
      .get(`/scans/${done.id}/findings?tier=violation`)
      .set(auth)
      .expect(200);
    expect(filtered.body.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual([
      'static/image-alt',
    ]);
    const byWcag = await http().get(`/scans/${done.id}/findings?wcag=1.4.3`).set(auth).expect(200);
    expect(byWcag.body.total).toBe(1);
    await http().get(`/scans/${done.id}/findings?tier=bogus`).set(auth).expect(400);

    const html = await http().get(`/scans/${done.id}/report?format=html`).set(auth).expect(200);
    expect(html.headers['content-type']).toMatch(/text\/html/);
    expect(html.headers['content-security-policy']).toContain("default-src 'none'");
    expect(html.text).toContain('<!doctype html>');
    const sarif = await http().get(`/scans/${done.id}/report?format=sarif`).set(auth).expect(200);
    expect(sarif.headers['content-type']).toMatch(/application\/sarif\+json/);
    expect(JSON.parse(sarif.text).version).toBe('2.1.0');
    await http().get(`/scans/${done.id}/report?format=pdf`).set(auth).expect(400);

    const list = await http().get('/scans?status=succeeded').set(auth).expect(200);
    expect(list.body.scans.some((s: { id: string }) => s.id === done.id)).toBe(true);
  });

  it('reports a failed scan with its error and no results', async () => {
    const created = await http()
      .post('/scans')
      .set(auth)
      .send({ targets: ['https://public.test/boom'] })
      .expect(202);
    const done = await waitDone(created.body.id);
    expect(done).toMatchObject({ status: 'failed', error: 'browser crashed' });
    const res = await http().get(`/scans/${done.id}/results`).set(auth).expect(409);
    expect(res.body.status).toBe('failed');
  });

  it('validates input', async () => {
    const bad = async (body: unknown) =>
      (
        await http()
          .post('/scans')
          .set(auth)
          .send(body as object)
          .expect(400)
      ).body;
    expect((await bad({ targets: ['file:///etc/passwd'] })).issues[0].path).toBe('targets.0');
    expect((await bad({ targets: ['http://169.254.169.254/'] })).message).toBe(
      'Target not allowed.',
    );
    expect((await bad({ targets: ['http://10.0.0.1/'] })).issues[0].message).toMatch(/private/);
    expect((await bad({ targets: ['https://internal.test/'] })).issues[0].message).toMatch(
      /private/,
    );
    await bad({ targets: [] });
    await bad({ targets: [TARGET], config: { auth: { storageState: '/etc/passwd' } } });
    await bad({ targets: [TARGET], config: { unknownKey: 1 } });
    await http().post('/scans').set(auth).set('content-type', 'text/plain').send('hi').expect(415);
    await http()
      .post('/scans')
      .set(auth)
      .set('content-type', 'application/json')
      .send('{"targets":')
      .expect(400);
  });

  it('refuses oversized bodies', async () => {
    const huge = { targets: [TARGET], label: 'x'.repeat(config.maxBodyBytes + 10) };
    const res = await http().post('/scans').set(auth).send(huge).expect(413);
    expect(res.body.statusCode).toBe(413);
  });

  it('404s unknown and malformed ids', async () => {
    await http().get('/scans/00000000-0000-4000-8000-000000000000').set(auth).expect(404);
    await http().get('/scans/..%2F..%2Fetc').set(auth).expect(404);
    await http().delete('/scans/not-a-uuid').set(auth).expect(404);
  });
});

describe('server API rate limit', () => {
  it('limits scan creation per client', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clear-a11y-server-'));
    const config = loadServerConfig({
      DATA_DIR: dir,
      RATE_LIMIT_PER_MINUTE: '2',
      CLEAR_A11Y_WORKERS: '0',
    });
    const app = await createApp(config, {
      logger: false,
      lookup,
      queue: createMemoryQueue<ScanJobPayload, ScanJobResult>(),
    });
    await app.init();
    try {
      const post = () =>
        request(app.getHttpServer())
          .post('/scans')
          .send({ targets: [TARGET] });
      await post().expect(202);
      await post().expect(202);
      const res = await post().expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
