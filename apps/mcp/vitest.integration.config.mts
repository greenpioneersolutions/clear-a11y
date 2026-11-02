import { defineConfig } from 'vitest/config';

// Spawns the built server (dist/main.js) over stdio against fixtures/. Run with `nx test-integration mcp`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/mcp-integration',
  test: {
    name: 'mcp:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
}));
