import { EventEmitter } from 'node:events';
import type { SpawnFn } from './process.js';
import {
  findLocalUrl,
  killTree,
  runningProcessCount,
  signalTree,
  spawnManaged,
  stripAnsi,
  waitForReady,
} from './process.js';

describe('findLocalUrl', () => {
  it('finds the URL dev servers print, through color codes', () => {
    expect(
      findLocalUrl(
        '\x1b[32m  ➜  Local:\x1b[0m   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m',
      ),
    ).toBe('http://localhost:5173/');
    expect(findLocalUrl('ready - started server on 0.0.0.0:3000, url: http://localhost:3000')).toBe(
      'http://localhost:3000/',
    );
    expect(
      findLocalUrl('Angular Live Development Server is listening on http://127.0.0.1:4200/.'),
    ).toBe('http://127.0.0.1:4200/');
    expect(findLocalUrl('Listening on http://0.0.0.0:8080')).toBe('http://127.0.0.1:8080/');
    expect(findLocalUrl('Network: http://192.168.1.4:5173/')).toBeUndefined();
    expect(findLocalUrl('docs at https://vitejs.dev/config')).toBeUndefined();
    expect(stripAnsi('\x1b[1mbold\x1b[22m')).toBe('bold');
  });
});

describe('waitForReady (fake clock)', () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  };

  it('polls until the printed URL answers', async () => {
    const c = clock();
    let printed: string | undefined;
    let probes = 0;
    const url = await waitForReady({
      ...c,
      printedUrl: () => printed,
      exited: () => undefined,
      timeoutMs: 10_000,
      probe: async (u) => {
        probes++;
        if (probes === 2) printed = 'http://127.0.0.1:5173/';
        return u === 'http://127.0.0.1:5173/' && probes > 3;
      },
      fallbackUrl: 'http://127.0.0.1:4000/',
    });
    expect(url).toBe('http://127.0.0.1:5173/');
    expect(c.now()).toBe(750);
  });

  it('times out, and stops early when the process exits', async () => {
    await expect(
      waitForReady({
        ...clock(),
        printedUrl: () => undefined,
        fallbackUrl: 'http://127.0.0.1:4000/',
        exited: () => undefined,
        timeoutMs: 1_000,
        probe: async () => false,
      }),
    ).rejects.toThrow(/did not answer within 1s at http:\/\/127.0.0.1:4000\//);
    let calls = 0;
    await expect(
      waitForReady({
        ...clock(),
        printedUrl: () => undefined,
        exited: () => (++calls > 2 ? 'exit code 1' : undefined),
        timeoutMs: 60_000,
        probe: async () => false,
      }),
    ).rejects.toThrow(/exited before it was ready \(exit code 1\)/);
  });
});

describe('process tree kill (mocked)', () => {
  it('signals the process group on POSIX, then SIGKILLs survivors after the grace period', async () => {
    const calls: Array<[number, string | number | undefined]> = [];
    const kill = (pid: number, signal?: NodeJS.Signals | 0) => {
      calls.push([pid, signal]);
      if (signal === 0) return; // still alive
    };
    await killTree(4242, { platform: 'linux', kill, graceMs: 200, sleep: async () => undefined });
    expect(calls[0]).toEqual([-4242, 'SIGTERM']);
    expect(calls.at(-1)).toEqual([-4242, 'SIGKILL']);
  });

  it('stops waiting as soon as the group is gone', async () => {
    const calls: Array<[number, string | number | undefined]> = [];
    const kill = (pid: number, signal?: NodeJS.Signals | 0) => {
      calls.push([pid, signal]);
      if (signal === 0) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    };
    await killTree(7, { platform: 'darwin', kill, sleep: async () => undefined });
    expect(calls.map((c) => c[1])).toEqual(['SIGTERM', 0, 0]);
  });

  it('falls back to the pid when the group is gone, and uses taskkill /T on Windows', () => {
    const calls: Array<[number, string | number | undefined]> = [];
    signalTree(9, 'SIGTERM', {
      platform: 'linux',
      kill: (pid, signal) => {
        calls.push([pid, signal]);
        if (pid < 0) throw new Error('ESRCH');
      },
    });
    expect(calls).toEqual([
      [-9, 'SIGTERM'],
      [9, 'SIGTERM'],
    ]);
    const tk: number[] = [];
    signalTree(11, 'SIGTERM', { platform: 'win32', taskkill: (pid) => tk.push(pid) });
    expect(tk).toEqual([11]);
  });
});

describe('spawnManaged (mocked child_process)', () => {
  it('spawns detached with piped output, collects it without colors, and stops once', async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 99999999,
      stdout: Object.assign(new EventEmitter(), { destroy: () => undefined }),
      stderr: Object.assign(new EventEmitter(), { destroy: () => undefined }),
      kill: () => true,
    });
    let spawned: { command: string; args: string[]; options: Record<string, unknown> } | undefined;
    const spawn = ((command: string, args: string[], options: Record<string, unknown>) => {
      spawned = { command, args, options };
      return child;
    }) as unknown as SpawnFn;
    const before = runningProcessCount();
    const proc = spawnManaged('npm', ['run', 'dev'], {
      cwd: '/repo',
      env: { PORT: '1' },
      spawn,
      platform: 'linux',
    });
    expect(spawned).toMatchObject({
      command: 'npm',
      args: ['run', 'dev'],
      options: { cwd: '/repo', detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
    });
    expect(runningProcessCount()).toBe(before + 1);
    child.stdout.emit('data', Buffer.from('\x1b[32mLocal: http://127.0.0.1:5173/\x1b[0m\n'));
    expect(proc.output()).toBe('Local: http://127.0.0.1:5173/\n');
    expect(proc.exitReason()).toBeUndefined();
    child.emit('exit', null, 'SIGTERM');
    expect(proc.exitReason()).toBe('signal SIGTERM');
    // pid 99999999 does not exist: kill() finds nothing to signal and returns quickly.
    await Promise.all([proc.stop(), proc.stop()]);
    expect(runningProcessCount()).toBe(before);
  });

  it('throws when the process could not be started', () => {
    const spawn = (() =>
      Object.assign(new EventEmitter(), {
        pid: undefined,
        kill: () => true,
      })) as unknown as SpawnFn;
    expect(() => spawnManaged('nope', [], { cwd: '/', env: {}, spawn })).toThrow(/could not start/);
  });
});
