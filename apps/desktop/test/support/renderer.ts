import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startStaticServer, type StaticServer } from '@clear-a11y/browser';
import { build } from 'esbuild';

export const APP_DIR = join(import.meta.dirname, '..', '..');
export const RENDERER_DIR = join(APP_DIR, 'dist', 'renderer');
export const SCREENSHOT_DIR = join(APP_DIR, 'test-output', 'screenshots');

/** Serves the BUILT renderer (`nx build desktop` runs first: test-integration depends on build). */
export async function serveRenderer(): Promise<StaticServer> {
  if (!existsSync(join(RENDERER_DIR, 'index.html'))) {
    throw new Error('dist/renderer is missing: run `pnpm nx run desktop:build` first.');
  }
  return startStaticServer({ root: RENDERER_DIR });
}

/** Bundles a browser-side test script (the bridge stand-ins) into one IIFE string. */
export async function bundleScript(file: 'web-bridge.ts' | 'static-bridge.ts'): Promise<string> {
  const out = await build({
    entryPoints: [join(import.meta.dirname, file)],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome130',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0]?.text ?? '';
}
