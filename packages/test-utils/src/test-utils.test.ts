import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createFinding } from '@clear-a11y/core';
import {
  expectFinding,
  expectNoFinding,
  findWorkspaceRoot,
  fixturesSiteDir,
  loadRecording,
  startStaticServer,
} from './index.js';

describe('paths', () => {
  it('finds the workspace root and fixtures', () => {
    expect(existsSync(join(findWorkspaceRoot(), 'nx.json'))).toBe(true);
    expect(fixturesSiteDir().endsWith(join('fixtures', 'site'))).toBe(true);
  });
});

describe('static server', () => {
  it('serves files from the root on localhost', async () => {
    const server = await startStaticServer({ root: findWorkspaceRoot() });
    try {
      expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const ok = await fetch(server.url('nx.json'));
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toContain('application/json');
      expect((await fetch(server.url('missing.html'))).status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe('recordings', () => {
  it('loads a recorded response and rejects odd names', () => {
    expect(loadRecording('example').response).toMatchObject({ verdict: 'pass' });
    expect(() => loadRecording('../secrets')).toThrow(/Invalid/);
  });
});

describe('finding assertions', () => {
  const f = createFinding({
    ruleId: 'static/image-alt',
    wcag: ['1.1.1'],
    tier: 'violation',
    confidence: 1,
    engine: 'engine-static',
    page: { url: 'u' },
    target: { selector: 'main > #hero' },
    message: 'Image has no text alternative.',
  });

  it('finds matches and explains misses', () => {
    expect(expectFinding([f], { wcag: '1.1.1', selector: '#hero' })).toBe(f);
    expect(() => expectFinding([f], { wcag: '2.4.3' })).toThrow(
      /static\/image-alt \[violation\] main > #hero/,
    );
    expect(() => expectNoFinding([f])).toThrow();
    expectNoFinding([f], { tier: 'likely' });
  });
});
