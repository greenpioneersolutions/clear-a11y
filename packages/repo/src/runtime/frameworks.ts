import type { PackageManager } from '../detect/detect-repo.js';

/** Dev servers we know how to start on a chosen port. */
export const DEV_FRAMEWORKS = [
  'next',
  'nuxt',
  'sveltekit',
  'angular',
  'astro',
  'vue-cli',
  'cra',
  'vite',
  'unknown',
] as const;
export type DevFramework = (typeof DEV_FRAMEWORKS)[number];

/** The parts of package.json the dev-server layer reads. */
export interface DevPackageJson {
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

/** Scripts tried in order when the user doesn't name one. */
export const DEV_SCRIPT_CANDIDATES = ['dev', 'start', 'serve'] as const;

/**
 * Which dev server a package uses, from its dependencies. Meta-frameworks win over the bundler they
 * are built on (Next over React, SvelteKit and Astro over Vite). Pure.
 */
export function detectFramework(pkg: DevPackageJson): DevFramework {
  const deps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  if (deps.has('next')) return 'next';
  if (deps.has('nuxt') || deps.has('nuxt3')) return 'nuxt';
  if (deps.has('@sveltejs/kit')) return 'sveltekit';
  if (deps.has('@angular/cli') || deps.has('@angular-devkit/build-angular')) return 'angular';
  if (deps.has('astro')) return 'astro';
  if (deps.has('@vue/cli-service')) return 'vue-cli';
  if (deps.has('react-scripts')) return 'cra';
  if (deps.has('vite')) return 'vite';
  return 'unknown';
}

/** The script to run: the requested one if it exists, else `dev`, `start`, `serve`. */
export function pickDevScript(pkg: DevPackageJson, requested?: string): string | undefined {
  const scripts = pkg.scripts ?? {};
  const has = (name: string) => typeof scripts[name] === 'string' && !!scripts[name];
  if (requested) return has(requested) ? requested : undefined;
  return DEV_SCRIPT_CANDIDATES.find(has);
}

/** Command-line flags that make each dev server listen on 127.0.0.1:<port> (and fail if busy). */
export function portArgs(framework: DevFramework, port: number): string[] {
  const p = String(port);
  switch (framework) {
    case 'vite':
    case 'sveltekit':
      return ['--port', p, '--strictPort', '--host', '127.0.0.1'];
    case 'next':
      return ['-p', p, '-H', '127.0.0.1'];
    case 'nuxt':
    case 'angular':
    case 'astro':
    case 'vue-cli':
      return ['--port', p, '--host', '127.0.0.1'];
    case 'cra':
    case 'unknown':
      return []; // configured through PORT / HOST environment variables
  }
}

/** The framework's own dev command, optionally followed by flags: `vite`, `next dev --turbo`, `ng serve`. */
const FLAGS = String.raw`(\s+-.*)?$`;
const DEV_COMMANDS: Record<Exclude<DevFramework, 'cra' | 'unknown'>, RegExp> = {
  vite: new RegExp(String.raw`^vite(\s+(dev|serve))?` + FLAGS),
  sveltekit: new RegExp(String.raw`^vite(\s+dev)?` + FLAGS),
  next: new RegExp(String.raw`^next\s+dev` + FLAGS),
  nuxt: new RegExp(String.raw`^(nuxt|nuxi)\s+dev` + FLAGS),
  angular: new RegExp(String.raw`^ng\s+serve` + FLAGS),
  astro: new RegExp(String.raw`^astro\s+dev` + FLAGS),
  'vue-cli': new RegExp(String.raw`^vue-cli-service\s+serve` + FLAGS),
};

/**
 * True when the script runs the framework's dev command directly, so port flags appended to it
 * reach that command. Scripts that wrap it (`concurrently`, `cross-env`, `&&` chains) get the port
 * through environment variables only.
 */
export function scriptAcceptsPortArgs(framework: DevFramework, script: string): boolean {
  if (framework === 'cra' || framework === 'unknown') return false;
  const s = script.trim();
  if (/&&|\|\||;|\|/.test(s)) return false;
  return DEV_COMMANDS[framework].test(s);
}

export interface DevCommand {
  command: string;
  args: string[];
  /** Added to the environment (on top of the current one). */
  env: Record<string, string>;
}

/**
 * How to run the dev script through the repo's own package manager on 127.0.0.1:<port>. Never an
 * install: only `<pm> run <script>`. npm needs `--` before extra flags; pnpm, yarn and bun pass
 * flags after the script name through.
 */
export function buildDevCommand(input: {
  packageManager: PackageManager;
  script: string;
  scriptText: string;
  framework: DevFramework;
  port: number;
  platform?: NodeJS.Platform;
}): DevCommand {
  const pm = input.packageManager === 'unknown' ? 'npm' : input.packageManager;
  const win = (input.platform ?? process.platform) === 'win32';
  const extra = scriptAcceptsPortArgs(input.framework, input.scriptText)
    ? portArgs(input.framework, input.port)
    : [];
  const args = ['run', input.script, ...(pm === 'npm' && extra.length ? ['--'] : []), ...extra];
  return {
    command: win && pm !== 'bun' ? `${pm}.cmd` : pm,
    args,
    env: {
      PORT: String(input.port),
      HOST: '127.0.0.1',
      // CRA, Vue CLI and others open a browser tab unless told not to.
      BROWSER: 'none',
      // Non-interactive: no prompts (Angular analytics, port-in-use questions), no watch UIs.
      CI: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  };
}
