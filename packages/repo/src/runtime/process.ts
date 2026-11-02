import { spawn as nodeSpawn, spawnSync, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

/** Removes terminal color and cursor codes (dev servers print a lot of them). */
export const stripAnsi = (text: string): string => text.replace(ANSI, '');

const LOCAL_URL =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|\[::\])(?::\d{2,5})?(?:\/[^\s'"<>)\]]*)?/i;

/**
 * The first local URL a dev server printed ("Local: http://localhost:5173/"). Wildcard binds
 * (0.0.0.0, [::]) are rewritten to 127.0.0.1, since that is where we connect. Undefined when none.
 */
export function findLocalUrl(output: string): string | undefined {
  const match = LOCAL_URL.exec(stripAnsi(output))?.[0];
  if (!match) return undefined;
  const cleaned = match.replace(/[.,;:]+$/, '').replace(/\/\/(0\.0\.0\.0|\[::\])/, '//127.0.0.1');
  try {
    return new URL(cleaned).href;
  } catch {
    return undefined;
  }
}

/** A free TCP port on 127.0.0.1 (asks the OS, then releases it for the dev server). */
export async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? ok(port) : fail(new Error('could not find a free port'))));
    });
  });
}

/** True when anything answers HTTP at `url` (any status: a 404 still means the server is up). */
export function httpResponds(url: string, timeoutMs = 2_000): Promise<boolean> {
  return new Promise((ok) => {
    const req = request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      res.resume();
      ok(true);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => ok(false));
    req.end();
  });
}

export interface WaitForReadyOptions {
  /** Latest URL printed by the process, if any. */
  printedUrl: () => string | undefined;
  /** URL to poll when nothing was printed (the port we asked for). */
  fallbackUrl?: string;
  /** Returns a reason when the process already exited (we stop waiting). */
  exited: () => string | undefined;
  timeoutMs: number;
  intervalMs?: number;
  probe?: (url: string) => Promise<boolean>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Waits until the dev server answers: polls the URL it printed (or the port we gave it) until any
 * HTTP response comes back. Fails fast when the process exits, and after `timeoutMs`.
 */
export async function waitForReady(options: WaitForReadyOptions): Promise<string> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const probe = options.probe ?? ((url: string) => httpResponds(url));
  const start = now();
  for (;;) {
    const gone = options.exited();
    if (gone) throw new Error(`the dev server exited before it was ready (${gone})`);
    const url = options.printedUrl() ?? options.fallbackUrl;
    if (url && (await probe(url))) return url;
    if (now() - start >= options.timeoutMs)
      throw new Error(
        `the dev server did not answer within ${Math.round(options.timeoutMs / 1000)}s${url ? ` at ${url}` : ''}`,
      );
    await sleep(options.intervalMs ?? 250);
  }
}

export interface KillDeps {
  platform?: NodeJS.Platform;
  kill?: (pid: number, signal?: NodeJS.Signals | 0) => void;
  taskkill?: (pid: number) => void;
}

const alive = (pid: number, kill: NonNullable<KillDeps['kill']>) => {
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH: gone. EPERM: it exists but we may not signal it.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * Sends `signal` to a process and everything it started. On POSIX the child was spawned
 * `detached`, so it leads its own process group and `kill(-pid)` reaches watchers (esbuild,
 * webpack) too. On Windows, `taskkill /T /F` ends the tree.
 */
export function signalTree(pid: number, signal: NodeJS.Signals, deps: KillDeps = {}): void {
  const platform = deps.platform ?? process.platform;
  if (platform === 'win32') {
    (
      deps.taskkill ??
      ((p: number) => {
        spawnSync('taskkill', ['/pid', String(p), '/T', '/F'], { stdio: 'ignore' });
      })
    )(pid);
    return;
  }
  const kill = deps.kill ?? process.kill.bind(process);
  try {
    kill(-pid, signal);
  } catch {
    try {
      kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Ends a process tree: SIGTERM to the group, then SIGKILL if anything is still alive after
 * `graceMs`. Resolves when the group is gone (or after the SIGKILL).
 */
export async function killTree(
  pid: number,
  options: KillDeps & { graceMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const kill = options.kill ?? process.kill.bind(process);
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  signalTree(pid, 'SIGTERM', options);
  if (platform === 'win32') return;
  const deadline = options.graceMs ?? 3_000;
  for (let waited = 0; waited < deadline; waited += 50) {
    if (!alive(-pid, kill) && !alive(pid, kill)) return;
    await sleep(50);
  }
  signalTree(pid, 'SIGKILL', options);
}

export interface ManagedProcess {
  pid: number;
  /** Everything printed so far (stdout and stderr, ANSI codes removed), capped to the last 64 KB. */
  output(): string;
  /** Set once the process has exited: "exit code 1" or "signal SIGTERM". */
  exitReason(): string | undefined;
  /** Kills the whole process tree and waits for it. Safe to call more than once. */
  stop(): Promise<void>;
}

export type SpawnFn = typeof nodeSpawn;

const MAX_OUTPUT = 64 * 1024;
const running = new Set<ManagedProcess>();
let hooksInstalled = false;

/** Last-resort cleanup: never leave a dev server behind when Clear A11Y exits or is interrupted. */
function installExitHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  process.on('exit', () => {
    for (const p of running) signalTree(p.pid, 'SIGKILL');
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(signal, () => {
      for (const p of running) signalTree(p.pid, 'SIGKILL');
      running.clear();
      process.kill(process.pid, signal);
    });
  }
}

/**
 * Starts a command in its own process group (POSIX) with piped output, and registers it for
 * cleanup on exit and SIGINT. The caller must `stop()` it (in a `finally`).
 */
export function spawnManaged(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; spawn?: SpawnFn; platform?: NodeJS.Platform },
): ManagedProcess {
  const platform = options.platform ?? process.platform;
  const child: ChildProcess = (options.spawn ?? nodeSpawn)(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    detached: platform !== 'win32',
    shell: platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (!child.pid) {
    child.kill?.();
    throw new Error(`could not start "${command} ${args.join(' ')}"`);
  }
  const pid = child.pid;
  let output = '';
  let exit: string | undefined;
  const onData = (chunk: Buffer | string) => {
    output = (output + stripAnsi(String(chunk))).slice(-MAX_OUTPUT);
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);
  const exited = new Promise<void>((ok) => {
    child.once('exit', (code, signal) => {
      exit = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
      ok();
    });
    child.once('error', (err) => {
      exit = err.message;
      ok();
    });
  });
  let stopping: Promise<void> | undefined;
  const managed: ManagedProcess = {
    pid,
    output: () => output,
    exitReason: () => exit,
    stop() {
      stopping ??= (async () => {
        await killTree(pid, { platform });
        // The leader's exit event can lag the group's death slightly; don't wait forever.
        await Promise.race([exited, new Promise((r) => setTimeout(r, 1_000))]);
        child.stdout?.destroy();
        child.stderr?.destroy();
        running.delete(managed);
      })();
      return stopping;
    },
  };
  installExitHooks();
  running.add(managed);
  return managed;
}

/** Processes started by `spawnManaged` that have not been stopped yet (for tests). */
export const runningProcessCount = (): number => running.size;
