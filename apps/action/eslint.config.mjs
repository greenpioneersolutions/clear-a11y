import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          // scripts/bundle.mjs (esbuild) and the tests run at build/test time only; the bundle
          // inlines every runtime dependency.
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest*.config.{js,ts,mjs,mts}',
            '{projectRoot}/scripts/**/*',
            '{projectRoot}/test/**/*',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    ignores: ['**/out-tsc', '**/dist'],
  },
];
