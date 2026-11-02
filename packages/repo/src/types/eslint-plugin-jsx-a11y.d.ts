// eslint-plugin-jsx-a11y ships no type declarations; this is the part we use.
declare module 'eslint-plugin-jsx-a11y' {
  import type { ESLint, Linter } from 'eslint';
  const plugin: ESLint.Plugin & {
    flatConfigs: { recommended: Linter.Config; strict: Linter.Config };
  };
  export default plugin;
}
