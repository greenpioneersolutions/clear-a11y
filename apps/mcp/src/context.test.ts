import { EventEmitter } from 'node:events';
import type { BrowserSession } from '@clear-a11y/browser';
import { createContext, optionsFromEnv, progressReporter, type ToolExtra } from './context.js';

function fakeSession() {
  const browser = new EventEmitter();
  let closed = 0;
  const session = {
    browser,
    newPage: async () => {
      throw new Error('unused');
    },
    close: async () => {
      closed++;
    },
  } as unknown as BrowserSession;
  return { session, browser, closed: () => closed };
}

describe('createContext', () => {
  it('launches one shared browser lazily and relaunches after a crash', async () => {
    const sessions = [fakeSession(), fakeSession()];
    let launches = 0;
    const ctx = createContext({
      cwd: '/work',
      launch: async () => (sessions[launches++] as ReturnType<typeof fakeSession>).session,
    });
    expect(ctx.outDir).toBe('/work/.clear-a11y/mcp');
    expect(launches).toBe(0);
    const [a, b] = await Promise.all([ctx.session(), ctx.session()]);
    expect(a).toBe(b);
    expect(launches).toBe(1);

    sessions[0]?.browser.emit('disconnected');
    expect(await ctx.session()).toBe(sessions[1]?.session);
    expect(launches).toBe(2);

    await ctx.close();
    expect(sessions[1]?.closed()).toBe(1);
  });

  it('retries the launch after a failure', async () => {
    let attempts = 0;
    const ok = fakeSession();
    const ctx = createContext({
      launch: async () => {
        if (attempts++ === 0) throw new Error('no browser');
        return ok.session;
      },
    });
    await expect(ctx.session()).rejects.toThrow('no browser');
    expect(await ctx.session()).toBe(ok.session);
  });
});

describe('optionsFromEnv', () => {
  it('reads the CLEAR_A11Y_* variables and ignores bad values', () => {
    const opts = optionsFromEnv({
      CLEAR_A11Y_MCP_OUT_DIR: 'reports',
      CLEAR_A11Y_MCP_MAX_SCANS: '5',
      CLEAR_A11Y_ALLOWED_ORIGINS: 'http://localhost:*',
    });
    expect(opts).toMatchObject({
      outDir: 'reports',
      maxScans: 5,
      allowedOrigins: 'http://localhost:*',
    });
    expect(optionsFromEnv({ CLEAR_A11Y_MCP_MAX_SCANS: 'lots' }).maxScans).toBeUndefined();
  });
});

describe('progressReporter', () => {
  it('sends notifications only when the client gave a progress token', () => {
    const sent: unknown[] = [];
    const extra = {
      _meta: { progressToken: 7 },
      sendNotification: async (n: unknown) => {
        sent.push(n);
      },
    } as unknown as ToolExtra;
    const report = progressReporter(extra);
    report('one');
    report('two', 5);
    expect(sent).toEqual([
      {
        method: 'notifications/progress',
        params: { progressToken: 7, progress: 1, message: 'one' },
      },
      {
        method: 'notifications/progress',
        params: { progressToken: 7, progress: 2, total: 5, message: 'two' },
      },
    ]);
    progressReporter({ ...extra, _meta: {} } as ToolExtra)('ignored');
    progressReporter(undefined)('ignored');
    expect(sent).toHaveLength(2);
  });
});
