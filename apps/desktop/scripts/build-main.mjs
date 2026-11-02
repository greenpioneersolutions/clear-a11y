// Bundles the Electron main process (ESM) and the sandboxed preload (CommonJS) with esbuild.
// Workspace packages and npm dependencies stay external (resolved from node_modules at runtime);
// the preload is fully bundled because sandboxed preloads can only require('electron').
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (p) => join(root, 'dist', p);

await rm(dist('main'), { recursive: true, force: true });
await rm(dist('preload'), { recursive: true, force: true });

await build({
  entryPoints: [join(root, 'src/main/main.ts')],
  outdir: dist('main'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'warning',
});

await build({
  entryPoints: [join(root, 'src/preload/preload.ts')],
  outfile: dist('preload/preload.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'chrome130',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning',
});

console.log('Built dist/main and dist/preload.');
