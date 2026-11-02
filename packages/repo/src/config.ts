import { z } from 'zod';

const repoRelative = z
  .string()
  .min(1)
  .refine((p) => !/^([a-zA-Z]:)?[\\/]/.test(p) && !p.split(/[\\/]/).includes('..'), {
    message: 'must be a path inside the repo (relative, no "..")',
  });

/** Options under `repo` in the Clear A11Y config. */
export const RepoConfigSchema = z.looseObject({
  /** Repo-relative directories to scan instead of the detected source folders. */
  include: z.array(repoRelative).optional(),
  /** Extra globs to skip, e.g. ["src/legacy/**"]. Tests and stories are skipped by default. */
  exclude: z.array(z.string()).default([]),
  /** Upper bound on files linted per scan. */
  maxFiles: z.number().int().positive().default(5000),
  /** Files larger than this are skipped (usually generated or vendored). */
  maxFileBytes: z
    .number()
    .int()
    .positive()
    .default(512 * 1024),
  /**
   * Load lint plugins that only exist in the scanned repo's node_modules (Angular template rules).
   * Off by default: it executes code from the repo. Turn it on only for repos you trust.
   */
  trustRepoPlugins: z.boolean().default(false),

  // Runtime layer (Storybook stories, dev server). See docs/repo-scanning.md.
  /** Set to false to skip the runtime layer entirely (static lint only). */
  runtime: z.boolean().default(true),
  /** Repo-relative path to a built Storybook (default: a detected `storybook-static/`). */
  storybookStatic: repoRelative.optional(),
  /** A running Storybook to read stories from. Must be a localhost URL. */
  storybookUrl: z.string().url().optional(),
  /** Upper bound on stories scanned per run. */
  maxStories: z.number().int().positive().default(50),
  /**
   * Globs matched against a story's id and title (`button--*`, `Components/**`). A story is kept
   * when it matches any glob without `!`; globs starting with `!` exclude. Empty keeps every story.
   */
  storyFilter: z.array(z.string().min(1)).default([]),
  /**
   * Start the repo's dev server when there is no Storybook. Off by default: it runs the repo's own
   * code (its dev script and everything it loads) on this machine. Same as `--boot`.
   */
  boot: z.boolean().default(false),
  /** package.json script to run with `boot` (default: `dev`, then `start`, then `serve`). */
  bootScript: z
    .string()
    .regex(/^[\w:.-]+$/, 'must be a package.json script name')
    .optional(),
  /** How long to wait for the dev server to answer before giving up. */
  bootTimeoutMs: z.number().int().positive().default(120_000),
  /** Total time budget for runtime pages (stories or crawled pages); the rest is skipped with a notice. */
  runtimeTimeoutMs: z.number().int().positive().default(600_000),
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type RepoConfigInput = z.input<typeof RepoConfigSchema>;

export function resolveRepoConfig(input: unknown = {}): RepoConfig {
  return RepoConfigSchema.parse(input ?? {});
}
