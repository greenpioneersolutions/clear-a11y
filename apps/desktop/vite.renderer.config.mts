import { defineConfig } from 'vite';

// Builds the renderer (static web UI) into dist/renderer. Relative base so it loads from the
// app's custom scheme (clear-a11y://app/) and from a plain static server in tests.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  cacheDir: '../../node_modules/.vite/apps/desktop-renderer',
  publicDir: false,
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
});
