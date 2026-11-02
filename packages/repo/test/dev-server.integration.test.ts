import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturesReposDir } from '@clear-a11y/test-utils';
import {
  detectRepo,
  httpResponds,
  planDevServer,
  runningProcessCount,
  startDevServer,
} from '../src/index.js';

// Real child processes (npm + node), no browser and no network beyond 127.0.0.1.

/** True while any process of the group led by `pid` is alive. */
const groupAlive = (pid: number) => {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0);
    return true;
  } catch {
    return false;
  }
};

const tempRepo = async (dev: string) => {
  const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-boot-'));
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'boot-test', private: true, scripts: { dev } }),
  );
  return dir;
};

describe('dev server (integration)', () => {
  it('starts static-app-sample, finds its printed URL, and kills the whole tree on stop', async () => {
    const root = join(fixturesReposDir(), 'static-app-sample');
    const plan = await planDevServer(root, await detectRepo(root));
    const server = await startDevServer(root, plan, { timeoutMs: 30_000 });
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      // `--port 0` in the script: the server picked its own port, which we read from its output.
      expect(server.url).not.toBe(`http://127.0.0.1:${plan.port}/`);
      const res = await fetch(new URL('form', server.url));
      expect(await res.text()).toContain('Contact us');
      expect(groupAlive(server.pid)).toBe(true);
    } finally {
      await server.stop();
    }
    expect(groupAlive(server.pid)).toBe(false);
    expect(await httpResponds(server.url, 500)).toBe(false);
  });

  it('kills the process tree when the server never becomes ready (timeout)', async () => {
    const root = await tempRepo('node -e "setInterval(() => {}, 1000)"');
    let pid = 0;
    try {
      const plan = await planDevServer(root, await detectRepo(root));
      await expect(
        startDevServer(root, plan, { timeoutMs: 1_500, onSpawn: (p) => (pid = p) }),
      ).rejects.toThrow(/did not answer within 2s/);
      expect(pid).toBeGreaterThan(0);
      expect(groupAlive(pid)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports a crashing dev server with the end of its output, and leaves nothing running', async () => {
    const root = await tempRepo(
      'node -e "console.error(\'boom: missing config\'); process.exit(3)"',
    );
    const before = runningProcessCount();
    let pid = 0;
    try {
      const plan = await planDevServer(root, await detectRepo(root));
      const err = await startDevServer(root, plan, {
        timeoutMs: 30_000,
        onSpawn: (p) => (pid = p),
      }).catch((e: unknown) => e as Error);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/exited before it was ready \(exit code \d+\)/);
      expect((err as Error).message).toContain('boom: missing config');
      expect(groupAlive(pid)).toBe(false);
      expect(runningProcessCount()).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
