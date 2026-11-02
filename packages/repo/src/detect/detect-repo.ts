import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const FRAMEWORKS = [
  'react',
  'preact',
  'next',
  'cra',
  'vue',
  'nuxt',
  'angular',
  'svelte',
  'sveltekit',
  'vite',
] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown';

/** Which static lint layer applies to the repo. */
export type Linter = 'jsx' | 'vue' | 'angular';

export interface StorybookInfo {
  present: boolean;
  /** Repo-relative config directory, e.g. ".storybook" or "packages/ui/.storybook". */
  configDirs: string[];
  /** Repo-relative prebuilt Storybook directories ("storybook-static"). */
  staticDirs: string[];
  /** A storybook package is listed in some package.json. */
  inDependencies: boolean;
}

export interface RepoDetection {
  packageManager: PackageManager;
  frameworks: Framework[];
  storybook: StorybookInfo;
  typescript: boolean;
  javascript: boolean;
  /** Package directories looked at, repo-relative ("." is the root). */
  packages: string[];
  /** Repo-relative directories with source files, e.g. ["src", "packages/ui/src"]. */
  sourceDirs: string[];
  /** Globs for the source files the static layer reads (informational, for reports and S10). */
  sourceGlobs: string[];
  /** Static lint layers that apply. */
  linters: Linter[];
  /** Frameworks we detected but the static layer cannot lint (for example Svelte). */
  unsupported: Framework[];
}

/** One package.json as read from disk. `dir` is repo-relative ("." for the root). */
export interface PackageManifest {
  dir: string;
  json: {
    packageManager?: unknown;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    peerDependencies?: Record<string, unknown>;
  };
}

/** Everything detection needs, gathered from disk by `detectRepo` or built in memory by tests. */
export interface DetectInput {
  manifests: PackageManifest[];
  /** Repo-relative paths that exist (files or directories), POSIX separators. */
  paths: ReadonlySet<string>;
}

/** Directories where application source usually lives, per package. */
export const SOURCE_DIR_CANDIDATES = ['src', 'app', 'pages', 'components', 'lib'];
/** Directories that hold workspace packages one level down. */
export const WORKSPACE_DIRS = ['packages', 'apps', 'libs'];
/** Never read: dependencies, build output, caches. */
export const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.angular',
  'coverage',
  'storybook-static',
  '.git',
  '.turbo',
  '.cache',
]);

const LOCKFILES: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

const join2 = (dir: string, name: string) => (dir === '.' ? name : `${dir}/${name}`);

function packageManagerOf(input: DetectInput): PackageManager {
  const root = input.manifests.find((m) => m.dir === '.');
  const field = typeof root?.json.packageManager === 'string' ? root.json.packageManager : '';
  const fromField = /^(pnpm|yarn|npm|bun)@/.exec(field)?.[1] as PackageManager | undefined;
  if (fromField) return fromField;
  for (const [file, pm] of LOCKFILES) if (input.paths.has(file)) return pm;
  return 'unknown';
}

/** Detects frameworks, Storybook, languages and source locations. Pure. */
export function detectFromInput(input: DetectInput): RepoDetection {
  const deps = new Set<string>();
  for (const m of input.manifests)
    for (const field of [m.json.dependencies, m.json.devDependencies, m.json.peerDependencies])
      for (const name of Object.keys(field ?? {})) deps.add(name);
  const has = (name: string) => deps.has(name);
  const hasPrefix = (prefix: string) => [...deps].some((d) => d.startsWith(prefix));

  const frameworks = new Set<Framework>();
  if (has('react') || has('react-dom')) frameworks.add('react');
  if (has('preact')) frameworks.add('preact');
  if (has('next')) frameworks.add('next').add('react');
  if (has('react-scripts')) frameworks.add('cra').add('react');
  if (has('vue')) frameworks.add('vue');
  if (has('nuxt') || has('nuxt3')) frameworks.add('nuxt').add('vue');
  if (has('@angular/core')) frameworks.add('angular');
  if (has('svelte')) frameworks.add('svelte');
  if (has('@sveltejs/kit')) frameworks.add('sveltekit').add('svelte');
  if (has('vite')) frameworks.add('vite');

  const packages = input.manifests.map((m) => m.dir).sort();
  if (!packages.includes('.')) packages.unshift('.');
  const configDirs = packages.map((p) => join2(p, '.storybook')).filter((p) => input.paths.has(p));
  const staticDirs = packages
    .map((p) => join2(p, 'storybook-static'))
    .filter((p) => input.paths.has(p));
  const inDependencies = has('storybook') || hasPrefix('@storybook/');

  const sourceDirs = packages.flatMap((p) => {
    const found = SOURCE_DIR_CANDIDATES.map((d) => join2(p, d)).filter((d) => input.paths.has(d));
    // A package with none of the usual folders: its own directory is the source (root only when
    // it is the only package, so a monorepo root doesn't swallow every workspace).
    return found.length ? found : p !== '.' || packages.length === 1 ? [p] : [];
  });

  const typescript =
    has('typescript') || [...input.paths].some((p) => /(^|\/)tsconfig(\.[\w-]+)?\.json$/.test(p));

  const linters: Linter[] = [];
  const jsx = ['react', 'preact', 'next', 'cra'].some((f) => frameworks.has(f as Framework));
  const anyFramework = ['vue', 'angular', 'svelte'].some((f) => frameworks.has(f as Framework));
  // No framework found at all: still lint .jsx/.tsx, since plain JSX is the most common case.
  if (jsx || !anyFramework) linters.push('jsx');
  if (frameworks.has('vue')) linters.push('vue');
  if (frameworks.has('angular')) linters.push('angular');

  const extensions = [
    ...(linters.includes('jsx') ? ['jsx', 'tsx', 'js'] : []),
    ...(linters.includes('vue') ? ['vue'] : []),
    ...(linters.includes('angular') ? ['html'] : []),
  ];
  const ext = extensions.length > 1 ? `{${extensions.join(',')}}` : (extensions[0] ?? '*');
  const sourceGlobs = sourceDirs.map((d) => (d === '.' ? `**/*.${ext}` : `${d}/**/*.${ext}`));

  return {
    packageManager: packageManagerOf(input),
    frameworks: FRAMEWORKS.filter((f) => frameworks.has(f)),
    storybook: {
      present: configDirs.length > 0 || staticDirs.length > 0 || inDependencies,
      configDirs,
      staticDirs,
      inDependencies,
    },
    typescript,
    javascript: !typescript || has('@babel/core') || jsx,
    packages,
    sourceDirs,
    sourceGlobs,
    linters,
    unsupported: frameworks.has('svelte') ? ['svelte'] : [],
  };
}

async function isDir(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );
}

async function readManifest(root: string, dir: string): Promise<PackageManifest | undefined> {
  try {
    const raw = await readFile(join(root, dir, 'package.json'), 'utf-8');
    const json = JSON.parse(raw) as unknown;
    return json && typeof json === 'object'
      ? { dir, json: json as PackageManifest['json'] }
      : undefined;
  } catch {
    return undefined;
  }
}

async function childDirs(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name))
    .map((e) => join2(dir, e.name));
}

/**
 * Detects how a repo is built by reading `package.json` files (root, direct children and one level
 * inside packages/, apps/, libs/) and checking for well-known files. Reads only; never runs code.
 */
export async function detectRepo(root: string): Promise<RepoDetection> {
  const candidates = ['.'];
  for (const dir of await childDirs(root, '.')) {
    candidates.push(dir);
    if (WORKSPACE_DIRS.includes(dir)) candidates.push(...(await childDirs(root, dir)));
  }
  const manifests = (await Promise.all(candidates.map((d) => readManifest(root, d)))).filter(
    (m): m is PackageManifest => !!m,
  );
  const packageDirs = [...new Set(['.', ...manifests.map((m) => m.dir)])];
  const probe = [
    ...LOCKFILES.map(([f]) => f),
    ...packageDirs.flatMap((p) => [
      join2(p, '.storybook'),
      join2(p, 'storybook-static'),
      join2(p, 'tsconfig.json'),
      ...SOURCE_DIR_CANDIDATES.map((d) => join2(p, d)),
    ]),
  ];
  const paths = new Set<string>();
  await Promise.all(
    probe.map(async (p) => {
      const exists = await stat(join(root, p)).then(
        () => true,
        () => false,
      );
      if (exists) paths.add(p);
    }),
  );
  // Source folders must be directories (a file named "lib" is not a source folder).
  for (const p of [...paths])
    if (
      SOURCE_DIR_CANDIDATES.some((d) => p === d || p.endsWith(`/${d}`)) &&
      !(await isDir(join(root, p)))
    )
      paths.delete(p);
  return detectFromInput({ manifests, paths });
}
