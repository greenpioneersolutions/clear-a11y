import nx from '@nx/eslint-plugin';
/**
 * Module boundaries (see AGENTS.md and docs/adr/0001-architecture.md).
 * Never loosen these to get past a lint error: fix the architecture instead.
 */
const depConstraints = [
  {
    sourceTag: 'type:app',
    onlyDependOnLibsWithTags: ['type:feature', 'type:engine', 'type:data-access', 'type:util'],
  },
  {
    sourceTag: 'type:feature',
    onlyDependOnLibsWithTags: ['type:feature', 'type:engine', 'type:data-access', 'type:util'],
  },
  { sourceTag: 'type:engine', onlyDependOnLibsWithTags: ['type:data-access', 'type:util'] },
  { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:util'] },
  { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
  { sourceTag: 'type:test', onlyDependOnLibsWithTags: ['type:data-access', 'type:util'] },
  {
    sourceTag: 'type:tool',
    onlyDependOnLibsWithTags: [
      'type:feature',
      'type:engine',
      'type:data-access',
      'type:util',
      'type:test',
      'type:tool',
    ],
  },
  { sourceTag: 'publish:public', onlyDependOnLibsWithTags: ['publish:public'] },
];
// Test files may additionally use test helpers (type:test). Production code may not.
const withTestHelpers = depConstraints.map((c) =>
  c.sourceTag.startsWith('type:') && c.sourceTag !== 'type:tool' && c.sourceTag !== 'type:test'
    ? { ...c, onlyDependOnLibsWithTags: [...c.onlyDependOnLibsWithTags, 'type:test'] }
    : c.sourceTag === 'publish:public'
      ? { ...c, onlyDependOnLibsWithTags: ['publish:public', 'publish:private'] }
      : c,
);
const testFiles = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.test.tsx',
  '**/*.spec.tsx',
  '**/test/**/*.ts',
  '**/e2e/**/*.ts',
  '**/vitest*.config.mts',
  '**/playwright.config.ts',
];
const boundaryRule = (constraints) => [
  'error',
  {
    enforceBuildableLibDependency: true,
    allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
    depConstraints: constraints,
  },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/test-output',
      '**/coverage',
      '**/vitest.config.*.timestamp*',
      'fixtures/site/**',
      'fixtures/repos/**',
      'bench-results/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.mjs'],
    rules: {
      '@nx/enforce-module-boundaries': boundaryRule(depConstraints),
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: testFiles,
    rules: {
      '@nx/enforce-module-boundaries': boundaryRule(withTestHelpers),
    },
  },
  {
    files: ['**/*.json'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
