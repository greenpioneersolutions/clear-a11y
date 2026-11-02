import { defineConfig } from 'vitest/config';

// The built renderer driven in Playwright Chromium (bridge stand-ins), the dogfood scan of the UI,
// and the Electron smoke test (skipped when the Electron binary is not installed).
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desktop-integration',
  test: {
    name: 'desktop:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    reporters: ['default'],
  },
}));
