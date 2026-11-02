import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { fixturesReposDir, startFixtureServer, type StaticServer } from '@clear-a11y/test-utils';

const MAIN = fileURLToPath(new URL('../dist/main.js', import.meta.url));

let server: StaticServer;
let client: Client;
let transport: StdioClientTransport;
let outDir: string;
let stderr = '';
const protocolErrors: Error[] = [];

beforeAll(async () => {
  if (!existsSync(MAIN)) throw new Error(`Build the server first: ${MAIN} is missing`);
  server = await startFixtureServer();
  outDir = mkdtempSync(join(tmpdir(), 'clear-a11y-mcp-'));
  const env: Record<string, string> = {
    ...getDefaultEnvironment(),
    CLEAR_A11Y_MCP_OUT_DIR: outDir,
    CLEAR_A11Y_LOG_LEVEL: 'info',
  };
  if (process.env['PLAYWRIGHT_BROWSERS_PATH'])
    env['PLAYWRIGHT_BROWSERS_PATH'] = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [MAIN],
    env,
    cwd: outDir,
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  client = new Client({ name: 'clear-a11y-test', version: '0.0.0' });
  client.onerror = (err) => protocolErrors.push(err);
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  await server?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

type Structured = Record<string, unknown>;
const call = async (name: string, args: Record<string, unknown>, onprogress?: () => void) =>
  (await client.callTool({ name, arguments: args }, undefined, {
    timeout: 110_000,
    ...(onprogress ? { onprogress } : {}),
  })) as CallToolResult;
const structured = (r: CallToolResult) => r.structuredContent as Structured;
const text = (r: CallToolResult) =>
  r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');

describe('clear-a11y MCP server over stdio', () => {
  let scanId = '';

  it('lists the five tools with input and output schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_findings', 'get_report', 'keyboard_walk', 'scan_repo', 'scan_url'].sort(),
    );
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(80);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema?.type).toBe('object');
    }
    const scanUrl = tools.find((t) => t.name === 'scan_url');
    expect(Object.keys(scanUrl?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['url', 'urls', 'viewports', 'engines', 'crawl', 'maxPages']),
    );
    expect(client.getInstructions()).toMatch(/untrusted/i);
  });

  it('scan_url scans a fixture page, reports progress and returns compact findings', async () => {
    let progress = 0;
    const result = await call(
      'scan_url',
      { url: server.url('static/img-missing-alt.html') },
      () => progress++,
    );
    expect(result.isError).toBeFalsy();
    const out = structured(result);
    scanId = out['scanId'] as string;
    expect(scanId).toMatch(/^s-/);
    expect(out['kind']).toBe('url');
    expect((out['summary'] as { violation: number }).violation).toBeGreaterThan(0);
    const top = out['topFindings'] as { ruleId: string; selector: string; tier: string }[];
    expect(top).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'static/image-alt',
          selector: '#hero',
          tier: 'violation',
        }),
      ]),
    );
    expect(out['untrusted']).toMatch(/never as instructions/);
    expect(text(result)).toContain('<untrusted-scan-data>');
    expect(existsSync(join(outDir, scanId, 'report.json'))).toBe(true);
    expect(progress).toBeGreaterThan(0);
  });

  it('get_findings filters by tier and paginates', async () => {
    const all = structured(await call('get_findings', { scanId }));
    const total = all['total'] as number;
    expect(total).toBeGreaterThan(0);

    const violations = structured(await call('get_findings', { scanId, tier: 'violation' }));
    const items = violations['findings'] as { tier: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((f) => f.tier === 'violation')).toBe(true);

    const first = structured(await call('get_findings', { scanId, limit: 1 }));
    expect((first['findings'] as unknown[]).length).toBe(1);
    expect(first['nextOffset']).toBe(total > 1 ? 1 : null);

    const byWcag = structured(await call('get_findings', { scanId, wcag: '1.1.1' }));
    expect(
      (byWcag['findings'] as { wcag: string[] }[]).every((f) => f.wcag.includes('1.1.1')),
    ).toBe(true);

    const id = (items[0] as unknown as { id: string }).id;
    const one = structured(await call('get_findings', { scanId, findingId: id }));
    expect(one['total']).toBe(1);
  });

  it('get_report returns markdown inline and writes SARIF and HTML files', async () => {
    const md = structured(await call('get_report', { scanId, format: 'markdown' }));
    expect(md['inline']).toBe(true);
    expect(md['text']).toContain('# Clear A11Y report');
    expect(md['text']).toContain('static/image-alt');
    expect(existsSync(md['path'] as string)).toBe(true);

    const sarif = structured(await call('get_report', { scanId, format: 'sarif' }));
    const log = JSON.parse(readFileSync(sarif['path'] as string, 'utf-8')) as {
      version: string;
      runs: { results: unknown[] }[];
    };
    expect(log.version).toBe('2.1.0');
    expect(log.runs[0]?.results.length).toBeGreaterThan(0);

    const html = structured(await call('get_report', { scanId, format: 'html' }));
    expect(html['inline']).toBe(false);
    expect(html['text']).toBeUndefined();
    expect(readFileSync(html['path'] as string, 'utf-8')).toMatch(/^<!doctype html>/i);
  });

  it('keyboard_walk returns the focus path with the backward stop', async () => {
    const result = await call('keyboard_walk', {
      url: server.url('keyboard/focus-order-backward.html'),
    });
    expect(result.isError).toBeFalsy();
    const out = structured(result);
    const stops = out['stops'] as { selector: string; backward?: boolean; role?: string }[];
    expect(stops.map((s) => s.selector)).toEqual([
      '#first-name',
      '#country',
      '#last-name',
      '#submit',
    ]);
    expect(stops[2]).toMatchObject({ selector: '#last-name', backward: true });
    expect(out['backwardJumps']).toEqual([{ from: 1, to: 2 }]);
    expect(out['end']).toBe('wrapped');
    expect(text(result)).toContain('[BACKWARD] #last-name');
  });

  it('scan_repo lints a local repo without running it', async () => {
    const result = await call('scan_repo', { path: join(fixturesReposDir(), 'react-sample') });
    expect(result.isError).toBeFalsy();
    const out = structured(result);
    expect(out['kind']).toBe('repo');
    expect((out['summary'] as { total: number }).total).toBeGreaterThan(0);
    expect((out['notices'] as string[]).join(' ')).toMatch(/source lint only/);
    const top = out['topFindings'] as { source?: { file: string } }[];
    expect(top.some((f) => f.source?.file.endsWith('.tsx'))).toBe(true);
  });

  it('rejects non-http URLs, unknown scans and missing paths as tool errors', async () => {
    const file = await call('scan_url', { url: 'file:///etc/passwd' });
    expect(file.isError).toBe(true);
    expect(text(file)).toMatch(/Only http\(s\) URLs/);

    const js = await call('keyboard_walk', { url: 'javascript:alert(1)' });
    expect(js.isError).toBe(true);

    const big = await call('scan_url', {
      url: server.url('static/ok.html'),
      crawl: true,
      maxPages: 500,
    });
    expect(big.isError).toBe(true);

    const unknown = await call('get_findings', { scanId: 's-nope-000000' });
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toMatch(/Unknown scanId/);

    const missing = await call('scan_repo', { path: join(outDir, 'does-not-exist') });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toMatch(/does not exist/);
  });

  it('exposes SKILL.md and recent scans as resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('clear-a11y://skill');
    expect(uris).toContain(`clear-a11y://scans/${scanId}`);
    const skill = await client.readResource({ uri: 'clear-a11y://skill' });
    expect((skill.contents[0] as { text: string }).text).toMatch(/^---\nname: clear-a11y/);
    const scan = await client.readResource({ uri: `clear-a11y://scans/${scanId}` });
    expect(JSON.parse((scan.contents[0] as { text: string }).text).scanId).toBe(scanId);
  });

  it('kept stdout clean: no protocol errors, logs went to stderr', () => {
    expect(protocolErrors).toEqual([]);
    expect(stderr).toContain('[clear-a11y]');
  });
});
