import { defineConfig } from 'vitest/config';

// Unit tests for the page generators (no browser). Run with `nx test docs`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/docs',
  test: {
    name: 'docs',
    watch: false,
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    reporters: ['default'],
  },
}));
