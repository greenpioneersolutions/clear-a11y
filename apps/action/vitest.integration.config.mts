import { defineConfig } from 'vitest/config';

// Runs the action against a temp git repo and the fixture server, in-process and as the bundle.
// Run with `nx test-integration action` (builds the bundle first).
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/action-integration',
  test: {
    name: 'action:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
}));
