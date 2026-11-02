import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFinding, summarize, type ScanResult } from '@clear-a11y/core';
import { parseFormats, parseScanResult, toJson, toText, writeReports } from './index.js';

const findings = [
  createFinding({
    ruleId: 'static/image-alt',
    wcag: ['1.1.1'],
    tier: 'violation',
    confidence: 0.95,
    engine: 'engine-static',
    page: { url: 'http://x/a.html' },
    target: { selector: '#hero' },
    message: 'Images must have alternate text',
  }),
  createFinding({
    ruleId: 'static/color-contrast',
    wcag: ['1.4.3'],
    tier: 'needs-review',
    confidence: 0.5,
    engine: 'engine-static',
    page: { url: 'http://x/a.html', state: 'dialog' },
    target: { selector: 'h1' },
    message: 'Check contrast',
    question: 'Enough contrast?',
  }),
];
const result: ScanResult = {
  schemaVersion: 1,
  tool: { name: 'clear-a11y', version: '0.0.0' },
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.000Z',
  targets: ['http://x/a.html'],
  pages: [{ url: 'http://x/a.html', viewport: 'desktop', states: ['default'] }],
  findings,
  errors: [],
  summary: summarize(findings),
};

describe('reporter', () => {
  it('round-trips the canonical JSON', () => {
    expect(parseScanResult(toJson(result))).toEqual(result);
  });

  it('rejects malformed reports', () => {
    expect(() => parseScanResult('{"schemaVersion":2}')).toThrow();
  });

  it('prints a terminal summary grouped by tier', () => {
    const text = toText(result);
    expect(text).toContain('2 finding(s) — 1 violation, 0 likely, 1 needs review');
    expect(text).toContain('VIOLATION (1)');
    expect(text).toContain('WCAG 1.1.1 Non-text Content');
    expect(text).toContain('[dialog]');
  });

  it('writes report.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-report-'));
    const [written] = await writeReports(result, dir);
    expect(written?.path).toBe(join(dir, 'report.json'));
    expect(
      parseScanResult(await readFile(join(dir, 'report.json'), 'utf-8')).findings,
    ).toHaveLength(2);
  });

  it('writes report.json, report.sarif and report.html', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-report-'));
    const written = await writeReports(result, dir, ['json', 'sarif', 'html', 'sarif']);
    expect(written.map((w) => w.path)).toEqual(
      ['report.json', 'report.sarif', 'report.html'].map((f) => join(dir, f)),
    );
    const sarif = JSON.parse(await readFile(join(dir, 'report.sarif'), 'utf-8'));
    expect(sarif.runs[0].results).toHaveLength(2);
    expect(await readFile(join(dir, 'report.html'), 'utf-8')).toMatch(/^<!doctype html>/);
  });

  it('rejects unknown formats', () => {
    expect(() => parseFormats(['json', 'pdf'])).toThrow(/Unknown report format "pdf"/);
  });
});
