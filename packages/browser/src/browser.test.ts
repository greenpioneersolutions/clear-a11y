import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileArtifactSink, memoryArtifactSink } from './artifacts.js';
import { padRect } from './screenshot.js';
import { resolveInside } from './server.js';
import { createPageContext, isSameDocument } from './session.js';

describe('padRect', () => {
  it('pads and clamps to the page', () => {
    expect(padRect({ x: 5, y: 5, width: 10, height: 10 }, 10, { width: 100, height: 100 })).toEqual(
      { x: 0, y: 0, width: 25, height: 25 },
    );
    expect(
      padRect({ x: 90, y: 90, width: 20, height: 20 }, 4, { width: 100, height: 100 }),
    ).toEqual({ x: 86, y: 86, width: 14, height: 14 });
  });
});

describe('artifact sinks', () => {
  it('writes files under artifacts/ with safe names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-'));
    const path = await fileArtifactSink(dir).save(
      '../../etc/passwd focus',
      new Uint8Array([1, 2, 3]),
    );
    expect(path).toMatch(/^artifacts\/etc-passwd-focus-[0-9a-f]{8}\.png$/);
    expect([...(await readFile(join(dir, path)))]).toEqual([1, 2, 3]);
  });

  it('keeps files in memory', async () => {
    const sink = memoryArtifactSink();
    expect(await sink.save('a', new Uint8Array([1]))).toBe('memory:a.png');
    expect(sink.files.size).toBe(1);
  });
});

describe('resolveInside', () => {
  it('never escapes the root', () => {
    expect(resolveInside('/srv/site', '/../etc/passwd')).toBe('/srv/site/etc/passwd');
    expect(resolveInside('/srv/site', '/%2e%2e/%2e%2e/etc/passwd')).toBe('/srv/site/etc/passwd');
    expect(resolveInside('/srv/site', '/a/b.html?x=1')).toBe('/srv/site/a/b.html');
  });
});

describe('isSameDocument', () => {
  it('detects navigations that would not reload the page', () => {
    expect(isSameDocument('http://a.test/app#/scans', 'http://a.test/app#/scans')).toBe(true);
    expect(isSameDocument('http://a.test/app#/scans', 'http://a.test/app#/review')).toBe(true);
    expect(isSameDocument('http://a.test/app', 'http://a.test/app?view=review')).toBe(false);
    expect(isSameDocument('about:blank', 'http://a.test/app')).toBe(false);
    expect(isSameDocument('', 'http://a.test/app')).toBe(false);
  });
});

describe('createPageContext', () => {
  const base = {
    page: {} as unknown as import('playwright').Page,
    url: 'http://a.test/',
    viewport: { name: 'desktop', width: 1280, height: 800 },
    config: {} as unknown as import('@clear-a11y/core').ClearA11yConfig,
  };

  it('passes recordPass through only when given (ADR 0003)', () => {
    expect(createPageContext(base)).not.toHaveProperty('recordPass');
    const seen: unknown[] = [];
    const ctx = createPageContext({ ...base, recordPass: (p) => seen.push(p) });
    ctx.recordPass?.({ ruleId: 'visual/x', wcag: ['1.4.3'], selector: 'h2' });
    expect(seen).toEqual([{ ruleId: 'visual/x', wcag: ['1.4.3'], selector: 'h2' }]);
  });
});
