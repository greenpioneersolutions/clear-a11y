import { defineConfig } from 'vitest/config';

// Practice what we test: scans the built site (apps/docs/dist) with Clear A11Y.
// Run with `nx test-integration docs` (builds the site first).
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/docs-integration',
  test: {
    name: 'docs:integration',
    watch: false,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
}));
