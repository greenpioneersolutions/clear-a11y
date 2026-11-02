import { defineConfig } from 'vitest/config';

// Browser tests against fixtures/. Run with `nx test-integration @clear-a11y/test-utils`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/test-utils-integration',
  test: {
    name: '@clear-a11y/test-utils:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
}));
