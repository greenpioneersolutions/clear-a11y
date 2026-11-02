import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { RepoDetection } from '../detect/detect-repo.js';
import {
  buildDevCommand,
  detectFramework,
  pickDevScript,
  type DevCommand,
  type DevFramework,
  type DevPackageJson,
} from './frameworks.js';
import {
  findLocalUrl,
  freePort,
  spawnManaged,
  waitForReady,
  type ManagedProcess,
  type SpawnFn,
} from './process.js';

/** A problem the user can fix (missing script, missing node_modules). The message says how. */
export class DevServerError extends Error {
  override readonly name = 'DevServerError';
}

export interface DevServerPlan {
  /** Repo-relative package folder whose script runs ("." for the root). */
  packageDir: string;
  framework: DevFramework;
  script: string;
  scriptText: string;
  port: number;
  command: DevCommand;
  /** Things the user should know (monorepo choice, port only via env). */
  notes: string[];
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function readPackage(root: string, dir: string): Promise<DevPackageJson | undefined> {
  try {
    const json = JSON.parse(await readFile(join(root, dir, 'package.json'), 'utf-8')) as unknown;
    return json && typeof json === 'object' ? (json as DevPackageJson) : undefined;
  } catch {
    return undefined;
  }
}

const hasDependencies = (pkg: DevPackageJson) =>
  Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length > 0;

/**
 * Decides how to start the repo's dev server, without starting it. Reads package.json files only.
 * Picks the root package, or in a monorepo the first package with a dev script (the limit is noted).
 * Throws DevServerError when there is no script to run or dependencies are not installed: Clear A11Y
 * never installs dependencies itself.
 */
export async function planDevServer(
  root: string,
  detection: Pick<RepoDetection, 'packages' | 'packageManager'>,
  options: { script?: string; port?: number; platform?: NodeJS.Platform } = {},
): Promise<DevServerPlan> {
  const notes: string[] = [];
  const dirs = ['.', ...detection.packages.filter((p) => p !== '.')];
  let chosen: { dir: string; pkg: DevPackageJson; script: string } | undefined;
  for (const dir of dirs) {
    const pkg = await readPackage(root, dir);
    const script = pkg && pickDevScript(pkg, options.script);
    if (pkg && script) {
      chosen = { dir, pkg, script };
      break;
    }
  }
  if (!chosen)
    throw new DevServerError(
      options.script
        ? `--boot: no package.json script named "${options.script}" was found.`
        : '--boot: no "dev", "start" or "serve" script found in package.json; set repo.bootScript to the script that starts the app.',
    );
  const { dir, pkg, script } = chosen;
  if (dir !== '.')
    notes.push(
      `Monorepo: started the dev server of ${dir} (the first package with a "${script}" script). Scan other apps by their URL or with repo.include.`,
    );
  if (
    hasDependencies(pkg) &&
    !(await exists(join(root, dir, 'node_modules'))) &&
    !(await exists(join(root, 'node_modules')))
  )
    throw new DevServerError(
      `--boot: dependencies are not installed (no node_modules in ${dir === '.' ? 'the repo' : dir}). Clear A11Y never installs packages; run your package manager's install yourself, then scan again.`,
    );
  const framework = detectFramework(pkg);
  const scriptText = String(pkg.scripts?.[script] ?? '');
  const port = options.port ?? (await freePort());
  const command = buildDevCommand({
    packageManager: detection.packageManager,
    script,
    scriptText,
    framework,
    port,
    platform: options.platform,
  });
  if (!command.args.includes(String(port)))
    notes.push(
      `The "${script}" script gets the port only through the PORT environment variable; the URL it prints is used when it picks another one.`,
    );
  return { packageDir: dir, framework, script, scriptText, port, command, notes };
}

export interface RunningDevServer {
  /** Where the app answers, e.g. http://127.0.0.1:5173/. */
  url: string;
  pid: number;
  plan: DevServerPlan;
  /** Kills the dev server's whole process tree. Always call it (in a `finally`). */
  stop(): Promise<void>;
}

export interface StartDevServerOptions {
  timeoutMs: number;
  spawn?: SpawnFn;
  /** Called right after the process starts (tests use it to check cleanup). */
  onSpawn?: (pid: number) => void;
  log?: { info(message: string, data?: Record<string, unknown>): void };
}

/**
 * Starts the planned dev server as a child process (runs the repo's code), waits until it answers,
 * and returns its URL. On any failure (exit, timeout) the process tree is killed before the error
 * is thrown, with the tail of the server's output in the message.
 */
export async function startDevServer(
  root: string,
  plan: DevServerPlan,
  options: StartDevServerOptions,
): Promise<RunningDevServer> {
  const cwd = join(root, plan.packageDir);
  options.log?.info('starting dev server (runs repo code)', {
    cwd: plan.packageDir,
    command: [plan.command.command, ...plan.command.args].join(' '),
  });
  const proc: ManagedProcess = spawnManaged(plan.command.command, plan.command.args, {
    cwd,
    env: { ...process.env, ...plan.command.env },
    spawn: options.spawn,
  });
  options.onSpawn?.(proc.pid);
  try {
    const url = await waitForReady({
      printedUrl: () => findLocalUrl(proc.output()),
      fallbackUrl: `http://127.0.0.1:${plan.port}/`,
      exited: proc.exitReason,
      timeoutMs: options.timeoutMs,
    });
    return { url, pid: proc.pid, plan, stop: () => proc.stop() };
  } catch (err) {
    await proc.stop();
    const tail = proc.output().trim().split('\n').slice(-8).join('\n');
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`--boot: ${message}.${tail ? `\nLast output:\n${tail}` : ''}`);
  }
}
