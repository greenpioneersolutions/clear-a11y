import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ScanResultSchema } from '@clear-a11y/core';
import { startFixtureServer, type StaticServer } from '@clear-a11y/test-utils';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadServerConfig } from '../src/config.js';

/**
 * End to end with the real pieces: SQLite queue in a temp dir, the in-process worker, the real
 * runner (Playwright) scanning the local fixture server, and the real reporters.
 */
describe('server (SQLite queue, real scan of fixtures)', () => {
  const TOKEN = 'integration-token-0123456789';
  const auth = { Authorization: `Bearer ${TOKEN}` };
  let fixtures: StaticServer;
  let dir: string;
  let app: INestApplication;

  beforeAll(async () => {
    fixtures = await startFixtureServer();
    dir = mkdtempSync(join(tmpdir(), 'clear-a11y-server-it-'));
    const config = loadServerConfig({
      DATA_DIR: dir,
      CLEAR_A11Y_TOKEN: TOKEN,
      ALLOWED_TARGETS: fixtures.origin,
    });
    app = await createApp(config, { logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await fixtures?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  async function waitDone(id: string) {
    for (let i = 0; i < 400; i++) {
      const res = await http().get(`/scans/${id}`).set(auth).expect(200);
      if (['succeeded', 'failed', 'cancelled'].includes(res.body.status)) return res.body;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`scan ${id} did not finish`);
  }

  it('scans a fixture page and serves findings, JSON, HTML and SARIF', async () => {
    const created = await http()
      .post('/scans')
      .set(auth)
      .send({
        targets: [fixtures.url('/static/img-missing-alt.html'), fixtures.url('/static/ok.html')],
        config: {
          engines: { states: false, keyboard: false, visual: false, at: false, widgets: false },
        },
      })
      .expect(202);
    const done = await waitDone(created.body.id);
    expect(done.status).toBe('succeeded');
    expect(done.progress).toEqual({ done: 2, total: 2 });

    const results = await http().get(`/scans/${done.id}/results`).set(auth).expect(200);
    const result = ScanResultSchema.parse(results.body);
    expect(result.pages).toHaveLength(2);
    const hero = result.findings.find(
      (f) => f.page.url.endsWith('img-missing-alt.html') && f.target.selector === '#hero',
    );
    expect(hero?.wcag).toContain('1.1.1');
    expect(result.findings.filter((f) => f.page.url.endsWith('/ok.html'))).toEqual([]);

    const findings = await http()
      .get(`/scans/${done.id}/findings?wcag=1.1.1`)
      .set(auth)
      .expect(200);
    expect(findings.body.total).toBeGreaterThan(0);

    const html = await http().get(`/scans/${done.id}/report?format=html`).set(auth).expect(200);
    expect(html.headers['content-security-policy']).toContain("default-src 'none'");
    expect(html.text).toContain('#hero');
    const sarif = await http().get(`/scans/${done.id}/report?format=sarif`).set(auth).expect(200);
    expect(JSON.parse(sarif.text).runs[0].results.length).toBeGreaterThan(0);
    const json = await http().get(`/scans/${done.id}/report?format=json`).set(auth).expect(200);
    expect(ScanResultSchema.parse(JSON.parse(json.text)).findings).toHaveLength(
      result.findings.length,
    );
  });

  it('refuses SSRF targets and unauthenticated requests', async () => {
    await http()
      .post('/scans')
      .send({ targets: [fixtures.url('/static/ok.html')] })
      .expect(401);
    for (const target of ['file:///etc/passwd', 'http://169.254.169.254/', 'http://10.0.0.1/']) {
      await http()
        .post('/scans')
        .set(auth)
        .send({ targets: [target] })
        .expect(400);
    }
  });
});
