import { defineConfig } from 'vitest/config';

// Real scans (Playwright) against fixtures/. Run with `nx test-integration server`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/server-integration',
  test: {
    name: 'server:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
}));
