import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixturesReposDir } from '@clear-a11y/test-utils';
import {
  buildDevCommand,
  detectFramework,
  pickDevScript,
  portArgs,
  scriptAcceptsPortArgs,
  type DevFramework,
  type DevPackageJson,
} from './frameworks.js';

const manifest = async (name: string): Promise<DevPackageJson> =>
  JSON.parse(
    await readFile(join(fixturesReposDir(), 'framework-manifests', name, 'package.json'), 'utf-8'),
  ) as DevPackageJson;

// Fixture package.json files only: nothing is installed or run.
describe.each<[string, DevFramework, string, string[]]>([
  [
    'vite',
    'vite',
    'dev',
    ['run', 'dev', '--', '--port', '4100', '--strictPort', '--host', '127.0.0.1'],
  ],
  ['next', 'next', 'dev', ['run', 'dev', '--', '-p', '4100', '-H', '127.0.0.1']],
  ['cra', 'cra', 'start', ['run', 'start']],
  ['nuxt', 'nuxt', 'dev', ['run', 'dev', '--', '--port', '4100', '--host', '127.0.0.1']],
  [
    'sveltekit',
    'sveltekit',
    'dev',
    ['run', 'dev', '--', '--port', '4100', '--strictPort', '--host', '127.0.0.1'],
  ],
  ['angular', 'angular', 'start', ['run', 'start', '--', '--port', '4100', '--host', '127.0.0.1']],
])('%s app', (name, framework, script, args) => {
  it(`detects ${framework}, picks "${script}" and builds the npm command`, async () => {
    const pkg = await manifest(name);
    expect(detectFramework(pkg)).toBe(framework);
    expect(pickDevScript(pkg)).toBe(script);
    const cmd = buildDevCommand({
      packageManager: 'npm',
      script,
      scriptText: String(pkg.scripts?.[script]),
      framework,
      port: 4100,
      platform: 'linux',
    });
    expect(cmd.command).toBe('npm');
    expect(cmd.args).toEqual(args);
    expect(cmd.env).toMatchObject({
      PORT: '4100',
      HOST: '127.0.0.1',
      BROWSER: 'none',
      CI: '1',
    });
  });
});

describe('detectFramework', () => {
  it('prefers the meta-framework over the bundler and covers Astro and Vue CLI', () => {
    expect(detectFramework({ devDependencies: { astro: '4', vite: '5' } })).toBe('astro');
    expect(detectFramework({ devDependencies: { '@vue/cli-service': '5' } })).toBe('vue-cli');
    expect(detectFramework({ dependencies: { next: '15', react: '18' } })).toBe('next');
    expect(detectFramework({})).toBe('unknown');
  });
});

describe('pickDevScript', () => {
  it('uses the requested script only if it exists, else dev, start, serve', () => {
    const pkg = { scripts: { start: 'node a.js', serve: 'x', storybook: 'storybook dev' } };
    expect(pickDevScript(pkg)).toBe('start');
    expect(pickDevScript(pkg, 'storybook')).toBe('storybook');
    expect(pickDevScript(pkg, 'dev')).toBeUndefined();
    expect(pickDevScript({ scripts: { build: 'x' } })).toBeUndefined();
    expect(pickDevScript({ scripts: { dev: '' } })).toBeUndefined();
  });
});

describe('port handling', () => {
  it('appends port flags only when the script runs the dev command directly', () => {
    expect(scriptAcceptsPortArgs('vite', 'vite')).toBe(true);
    expect(scriptAcceptsPortArgs('vite', 'vite --open')).toBe(true);
    expect(scriptAcceptsPortArgs('vite', 'vite build')).toBe(false);
    expect(scriptAcceptsPortArgs('next', 'next dev --turbo')).toBe(true);
    expect(scriptAcceptsPortArgs('next', 'next start')).toBe(false);
    expect(scriptAcceptsPortArgs('vite', 'npm run gen && vite')).toBe(false);
    expect(scriptAcceptsPortArgs('vite', 'concurrently "vite" "tsc -w"')).toBe(false);
    expect(scriptAcceptsPortArgs('cra', 'react-scripts start')).toBe(false);
    expect(scriptAcceptsPortArgs('unknown', 'node server.mjs')).toBe(false);
    expect(portArgs('cra', 3000)).toEqual([]);
    expect(portArgs('astro', 3000)).toEqual(['--port', '3000', '--host', '127.0.0.1']);
  });

  it('passes flags without "--" for pnpm, yarn and bun, and uses .cmd shims on Windows', () => {
    const base = { script: 'dev', scriptText: 'vite', framework: 'vite' as const, port: 5000 };
    expect(
      buildDevCommand({ ...base, packageManager: 'pnpm', platform: 'darwin' }).args.slice(0, 3),
    ).toEqual(['run', 'dev', '--port']);
    expect(buildDevCommand({ ...base, packageManager: 'yarn', platform: 'linux' }).command).toBe(
      'yarn',
    );
    expect(buildDevCommand({ ...base, packageManager: 'unknown', platform: 'linux' }).command).toBe(
      'npm',
    );
    expect(buildDevCommand({ ...base, packageManager: 'npm', platform: 'win32' }).command).toBe(
      'npm.cmd',
    );
    expect(buildDevCommand({ ...base, packageManager: 'bun', platform: 'win32' }).command).toBe(
      'bun',
    );
    const plain = buildDevCommand({
      ...base,
      scriptText: 'node server.mjs',
      framework: 'unknown',
      packageManager: 'npm',
      platform: 'linux',
    });
    expect(plain.args).toEqual(['run', 'dev']);
    expect(plain.env['PORT']).toBe('5000');
  });
});
