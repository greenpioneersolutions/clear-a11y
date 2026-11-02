/**
 * Fallback descriptions for the configuration reference, for schemas that don't carry their own
 * `.describe()` text. `ConfigSchema` in @clear-a11y/core describes every field itself; the `repo`
 * section (RepoConfigSchema in @clear-a11y/repo) is described here. Types and defaults always come
 * from the Zod schemas. The generator fails when an option has no description anywhere, when an
 * entry here has no option, or when an entry here duplicates a schema description.
 */
export const CONFIG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'repo.include': 'Repo-relative folders to lint instead of the detected source folders.',
  'repo.exclude': 'Extra globs to skip. Tests and stories are skipped by default.',
  'repo.maxFiles': 'Upper limit on files linted per scan.',
  'repo.maxFileBytes': 'Files larger than this are skipped (usually generated or vendored code).',
  'repo.trustRepoPlugins':
    "Load lint plugins from the repo's own node_modules (Angular template rules). This runs code from the repo: only for repos you trust.",
  'repo.runtime':
    'Set to false to skip the runtime layer (Storybook stories or the dev server) and only lint source.',
  'repo.storybookStatic':
    'Repo-relative path to a built Storybook. Default: a detected `storybook-static/`.',
  'repo.storybookUrl': 'A Storybook already running on this machine (localhost only).',
  'repo.maxStories': 'Upper limit on stories scanned per run.',
  'repo.storyFilter':
    'Globs matched against story ids and titles. A story is kept when it matches a glob; globs starting with `!` exclude.',
  'repo.boot':
    "Start the repo's dev server when there is no Storybook. This runs the repo's code on your machine. Same as `--boot`.",
  'repo.bootScript': 'package.json script to start (default: `dev`, then `start`, then `serve`).',
  'repo.bootTimeoutMs': 'How long to wait for the dev server to answer, in milliseconds.',
  'repo.runtimeTimeoutMs':
    'Total time budget for runtime pages, in milliseconds. The rest is skipped with a note.',
};
