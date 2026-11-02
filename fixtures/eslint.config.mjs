import baseConfig from '../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Sample repos are scanned as untrusted input, never linted as workspace code.
    ignores: ['**/out-tsc', 'repos/**'],
  },
];
