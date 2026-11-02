// A scanned repo's ESLint config is untrusted code. Clear A11Y must never load it: if it ever
// does, this throws and the repo integration test fails.
globalThis.__clearA11yLoadedRepoEslintConfig = true;
throw new Error('clear-a11y must never execute a scanned repo\'s eslint.config.js');
