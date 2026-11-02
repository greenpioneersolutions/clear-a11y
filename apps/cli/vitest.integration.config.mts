import { defineConfig } from 'vitest/config';

// Browser tests against fixtures/. Run with `nx test-integration cli`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/cli-integration',
  test: {
    name: 'cli:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
}));
