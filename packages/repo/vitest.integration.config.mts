import { defineConfig } from 'vitest/config';

// Browser tests against fixtures/. Run with `nx test-integration @clear-a11y/repo`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/repo-integration',
  test: {
    name: '@clear-a11y/repo:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
}));
