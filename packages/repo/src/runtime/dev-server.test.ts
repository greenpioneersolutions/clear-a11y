import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturesReposDir } from '@clear-a11y/test-utils';
import { DevServerError, planDevServer } from './dev-server.js';

const detection = (packages: string[] = ['.']) => ({
  packages,
  packageManager: 'unknown' as const,
});

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'clear-a11y-dev-'));
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

const pkg = (dir: string, json: object) =>
  mkdir(join(tmp, dir), { recursive: true }).then(() =>
    writeFile(join(tmp, dir, 'package.json'), JSON.stringify(json)),
  );

describe('planDevServer', () => {
  it('plans the static-app-sample dev script (no dependencies, so no node_modules needed)', async () => {
    const plan = await planDevServer(join(fixturesReposDir(), 'static-app-sample'), detection(), {
      port: 4321,
      platform: 'linux',
    });
    expect(plan).toMatchObject({
      packageDir: '.',
      framework: 'unknown',
      script: 'dev',
      scriptText: 'node server.mjs --port 0',
      port: 4321,
      command: { command: 'npm', args: ['run', 'dev'], env: { PORT: '4321', BROWSER: 'none' } },
    });
    expect(plan.notes.join(' ')).toMatch(/PORT environment variable/);
  });

  it('refuses to run when dependencies are not installed (never installs)', async () => {
    await pkg('.', { scripts: { dev: 'vite' }, devDependencies: { vite: '5' } });
    await expect(planDevServer(tmp, detection(), { port: 1 })).rejects.toThrow(DevServerError);
    await expect(planDevServer(tmp, detection(), { port: 1 })).rejects.toThrow(
      /not installed.*never installs/,
    );
    await mkdir(join(tmp, 'node_modules'));
    const plan = await planDevServer(tmp, detection(), { port: 5555, platform: 'linux' });
    expect(plan.framework).toBe('vite');
    expect(plan.command.args).toEqual([
      'run',
      'dev',
      '--',
      '--port',
      '5555',
      '--strictPort',
      '--host',
      '127.0.0.1',
    ]);
    expect(plan.notes).toEqual([]);
  });

  it('explains a missing script, and honors repo.bootScript', async () => {
    await pkg('.', { scripts: { build: 'tsc', 'start:web': 'node web.js' } });
    await expect(planDevServer(tmp, detection(), { port: 1 })).rejects.toThrow(
      /no "dev", "start" or "serve" script/,
    );
    await expect(planDevServer(tmp, detection(), { port: 1, script: 'web' })).rejects.toThrow(
      /no package.json script named "web"/,
    );
    const plan = await planDevServer(tmp, detection(), { port: 1, script: 'start:web' });
    expect(plan.script).toBe('start:web');
  });

  it('in a monorepo, starts the first package with a dev script and says so', async () => {
    await pkg('.', { private: true, scripts: { build: 'nx run-many -t build' } });
    await pkg('packages/web', { scripts: { dev: 'node server.js' } });
    const plan = await planDevServer(tmp, detection(['.', 'packages/web']), { port: 1 });
    expect(plan.packageDir).toBe('packages/web');
    expect(plan.notes[0]).toMatch(/Monorepo: started the dev server of packages\/web/);
  });
});
