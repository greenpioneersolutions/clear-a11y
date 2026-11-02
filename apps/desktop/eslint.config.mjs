import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest*.config.{js,ts,mjs,mts}',
            '{projectRoot}/vite.renderer.config.mts',
            '{projectRoot}/scripts/**/*',
            '{projectRoot}/test/**/*',
          ],
          // Build and runtime tools kept in devDependencies: the main bundle gets `electron` from
          // the Electron runtime itself; electron-builder and esbuild only run at build time.
          ignoredDependencies: ['electron', 'electron-builder', 'esbuild'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    ignores: ['**/out-tsc', '**/dist', '**/release'],
  },
];
