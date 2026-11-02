import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createPageContext,
  gotoAndSettle,
  launchBrowser,
  VIEWPORTS,
  type BrowserSession,
} from '@clear-a11y/browser';
import { resolveConfig } from '@clear-a11y/core';
import { fixturesSiteDir } from '@clear-a11y/test-utils';
import { join, normalize } from 'node:path';
import { createStatesEngine, discoverStates, type StateDescriptor } from '../src/index.js';

/** A fixture server that records every request, so tests can prove nothing unsafe reached it. */
let server: Server;
let base: string;
const requests: string[] = [];
let session: BrowserSession;

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')).replace(
      /^[/\\]+/,
      '',
    );
    if (req.method !== 'GET' || path.includes('..') || !path.endsWith('.html')) {
      res.writeHead(404).end();
      return;
    }
    readFile(join(fixturesSiteDir(), path))
      .then((body) => res.writeHead(200, { 'content-type': 'text/html' }).end(body))
      .catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  session = await launchBrowser();
});

afterAll(async () => {
  await session?.close();
  await new Promise((resolve) => server?.close(resolve));
});

const open = async (path: string) => {
  const { page, close } = await session.newPage(VIEWPORTS.desktop);
  const url = base + path;
  await gotoAndSettle(page, url);
  return {
    page,
    close,
    ctx: createPageContext({ page, url, viewport: VIEWPORTS.desktop, config: resolveConfig() }),
  };
};

describe('state exploration safety (integration)', () => {
  it('never activates destructive controls and never lets a form post reach the server', async () => {
    requests.length = 0;
    const fx = await open('states/destructive-button-ok.html');
    const states = await discoverStates(fx.ctx);
    expect(states.map((s) => s.id)).toEqual([
      'accordion:open#plan-details',
      'disclosure:open#name-help',
    ]);
    await gotoAndSettle(fx.page, fx.ctx.url);
    expect(await createStatesEngine().run(fx.ctx)).toEqual([]);
    // The explorer submitted the preferences form (method=post): the guard aborted it in the browser.
    expect(requests.filter((r) => !r.startsWith('GET '))).toEqual([]);
    expect(requests.filter((r) => r.includes('/api/'))).toEqual([]);
    expect(await fx.page.locator('#status').textContent()).toBe('');
    await fx.close();
  });

  it('never lets a navigation caused by changing a form control reach the server', async () => {
    requests.length = 0;
    const fx = await open('states/context-change-on-input.html');
    const findings = await createStatesEngine().run(fx.ctx);
    expect(findings.map((f) => f.ruleId)).toEqual(['states/context-change-on-input']);
    expect(requests.filter((r) => r.includes('country='))).toEqual([]);
    expect(new URL(fx.page.url()).search).toBe('');
    await fx.close();
  });

  it('keeps blocking non-GET requests and navigations after a state is replayed', async () => {
    requests.length = 0;
    const fx = await open('states/destructive-button-ok.html');
    const [state] = await discoverStates(fx.ctx);
    await gotoAndSettle(fx.page, fx.ctx.url);
    await (state as StateDescriptor).open(fx.page);
    const posted = await fx.page.evaluate(() =>
      fetch('/api/anything', { method: 'POST' }).then(
        () => 'sent',
        () => 'blocked',
      ),
    );
    expect(posted).toBe('blocked');
    await fx.page.locator('#sign-out').click();
    await fx.page.waitForTimeout(100);
    expect(new URL(fx.page.url()).pathname).toBe('/states/destructive-button-ok.html');
    expect(requests.filter((r) => r.includes('/api/'))).toEqual([]);
    await fx.close();
  });
});
