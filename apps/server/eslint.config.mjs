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
            '{projectRoot}/test/**/*',
          ],
          // Loaded indirectly: bullmq/ioredis are optional peers of @clear-a11y/queue (used when
          // REDIS_URL is set); rxjs and reflect-metadata are peers that NestJS needs at runtime.
          ignoredDependencies: ['bullmq', 'ioredis', 'rxjs', 'reflect-metadata'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    ignores: ['**/out-tsc'],
  },
];
