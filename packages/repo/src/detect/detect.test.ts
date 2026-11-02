import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { detectFromInput, detectRepo, type PackageManifest } from './detect-repo.js';
import { globToRegExp, listSourceFiles } from './files.js';

const manifest = (deps: Record<string, string>, dir = '.', extra = {}): PackageManifest => ({
  dir,
  json: { dependencies: deps, ...extra },
});
const detect = (manifests: PackageManifest[], paths: string[] = []) =>
  detectFromInput({ manifests, paths: new Set(paths) });

describe('detectFromInput', () => {
  it.each([
    [{ react: '18' }, ['react'], ['jsx']],
    [{ next: '15', react: '19' }, ['react', 'next'], ['jsx']],
    [{ 'react-scripts': '5' }, ['react', 'cra'], ['jsx']],
    [{ preact: '10' }, ['preact'], ['jsx']],
    [{ vue: '3', vite: '5' }, ['vue', 'vite'], ['vue']],
    [{ nuxt: '3' }, ['vue', 'nuxt'], ['vue']],
    [{ '@angular/core': '19' }, ['angular'], ['angular']],
    [{ '@sveltejs/kit': '2', svelte: '5' }, ['svelte', 'sveltekit'], []],
    [{}, [], ['jsx']],
  ])('detects %j', (deps, frameworks, linters) => {
    const d = detect([manifest(deps)]);
    expect(d.frameworks).toEqual(frameworks);
    expect(d.linters).toEqual(linters);
  });

  it('marks Svelte as unsupported by the static layer', () => {
    expect(detect([manifest({ svelte: '5' })]).unsupported).toEqual(['svelte']);
  });

  it('detects the package manager from packageManager or lockfiles', () => {
    expect(detect([manifest({}, '.', { packageManager: 'pnpm@9.15.4' })]).packageManager).toBe(
      'pnpm',
    );
    expect(detect([manifest({})], ['yarn.lock']).packageManager).toBe('yarn');
    expect(detect([manifest({})], ['package-lock.json']).packageManager).toBe('npm');
    expect(detect([manifest({})], ['bun.lockb']).packageManager).toBe('bun');
    expect(detect([manifest({})]).packageManager).toBe('unknown');
  });

  it('detects Storybook from config dirs, dependencies and prebuilt output', () => {
    expect(detect([manifest({ react: '18' })]).storybook.present).toBe(false);
    expect(detect([manifest({})], ['.storybook']).storybook).toMatchObject({
      present: true,
      configDirs: ['.storybook'],
    });
    expect(detect([manifest({ '@storybook/react-vite': '8' })]).storybook.inDependencies).toBe(
      true,
    );
    expect(detect([manifest({})], ['storybook-static']).storybook.staticDirs).toEqual([
      'storybook-static',
    ]);
  });

  it('detects TypeScript and source folders across workspaces', () => {
    const d = detect(
      [manifest({}), manifest({ react: '18' }, 'packages/ui'), manifest({ vue: '3' }, 'apps/web')],
      ['packages/ui/src', 'apps/web/pages', 'apps/web/components', 'packages/ui/tsconfig.json'],
    );
    expect(d.typescript).toBe(true);
    expect(d.packages).toEqual(['.', 'apps/web', 'packages/ui']);
    expect(d.sourceDirs).toEqual(['apps/web/pages', 'apps/web/components', 'packages/ui/src']);
    expect(d.linters).toEqual(['jsx', 'vue']);
    expect(d.sourceGlobs[0]).toBe('apps/web/pages/**/*.{jsx,tsx,js,vue}');
  });

  it('falls back to the repo root as source for a single package without usual folders', () => {
    expect(detect([manifest({ react: '18' })]).sourceDirs).toEqual(['.']);
  });
});

describe('globToRegExp', () => {
  it.each([
    ['**/*.test.*', 'src/a.test.tsx', true],
    ['**/*.test.*', 'a.test.ts', true],
    ['**/*.test.*', 'src/atest.ts', false],
    ['src/legacy/**', 'src/legacy/a/b.tsx', true],
    ['src/*.tsx', 'src/a/b.tsx', false],
    ['**/*.{stories,story}.*', 'src/a.story.tsx', true],
  ])('%s matches %s: %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});

describe('on disk', () => {
  let root: string;
  const write = async (path: string, content = '') => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'clear-a11y-repo-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('detectRepo reads package.json files one level down and probes well-known paths', async () => {
    await write('package.json', JSON.stringify({ private: true, packageManager: 'pnpm@9.0.0' }));
    await write('packages/ui/package.json', JSON.stringify({ dependencies: { react: '18' } }));
    await write('packages/ui/src/Button.tsx', 'export {}');
    await write('packages/ui/.storybook/main.ts', 'export default {}');
    await write('node_modules/vue/package.json', JSON.stringify({ name: 'vue' }));
    await write('lib', 'not a folder');
    const d = await detectRepo(root);
    expect(d.packageManager).toBe('pnpm');
    expect(d.frameworks).toEqual(['react']);
    expect(d.storybook.configDirs).toEqual(['packages/ui/.storybook']);
    expect(d.sourceDirs).toEqual(['packages/ui/src']);
  });

  it('listSourceFiles skips ignored folders, tests, symlinks and oversized files', async () => {
    await write('src/App.tsx', 'x');
    await write('src/App.test.tsx', 'x');
    await write('src/Button.stories.tsx', 'x');
    await write('src/util.ts', 'x');
    await write('src/node_modules/dep/index.jsx', 'x');
    await write('src/dist/out.js', 'x');
    await write('src/big.tsx', 'x'.repeat(2000));
    await write('outside/Secret.tsx', 'x');
    await symlink(join(root, 'outside'), join(root, 'src', 'linked'));
    const r = await listSourceFiles(root, ['src'], {
      extensions: ['tsx', 'jsx', 'js'],
      maxFileBytes: 1000,
    });
    expect(r.files).toEqual(['src/App.tsx']);
    expect(r.tooLarge).toEqual(['src/big.tsx']);
    expect(r.truncated).toBe(false);
  });

  it('listSourceFiles honours maxFiles and extra excludes', async () => {
    for (const n of ['a', 'b', 'c']) await write(`src/${n}.tsx`, 'x');
    await write('src/legacy/old.tsx', 'x');
    const r = await listSourceFiles(root, ['src'], {
      extensions: ['tsx'],
      exclude: ['src/legacy/**'],
      maxFiles: 2,
    });
    expect(r.files).toEqual(['src/a.tsx', 'src/b.tsx']);
    expect(r.truncated).toBe(true);
  });
});
