# S00a: Workspace

## Goal

Turn the repo into an Nx 24 workspace using Nx's current TypeScript "solution" setup: pnpm workspaces, TypeScript project references (no path aliases), ESM, strict TypeScript, a pnpm catalog for a single version policy, inferred tasks from Nx plugins, ESLint flat config that enforces the full module-boundary table, Prettier, correct cache inputs/outputs, and `nx release` configured for fixed versioning with conventional commits. No product code yet. Read the ground rules in "Notes" first.

## Wave

Wave 1, **serial**. First slice of the bootstrap; everything else builds on it.

## Projects

| Project          | Path | Package                        | Tags | Status  |
| ---------------- | ---- | ------------------------------ | ---- | ------- |
| (workspace root) | `/`  | `@clear-a11y/source` (private) | none | created |

No library projects are created in this slice.

## Depends on

Nothing. Existing files (`AGENTS.md`, `CLAUDE.md`, `docs/**`, `.gitignore`) must be kept intact.

## Scope

1. **Nx 24** installed as a root devDependency (`nx`, `@nx/js`, `@nx/vitest`, `@nx/eslint`, `@nx/eslint-plugin`, `@nx/playwright`, `@nx/devkit`, `@nx/plugin`). No Nx Cloud: no `nxCloudId`, no access token, `analytics: false`.
2. **pnpm workspaces**: `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `packages/engines/*`, `tools/*`, `fixtures`. `packageManager` pinned in root `package.json` (pnpm 9.x). Internal deps will use `workspace:*`.
3. **Catalog**: every third-party version lives once under `catalog:` in `pnpm-workspace.yaml`; all `package.json` files reference `"catalog:"`. Seed it with the toolchain (typescript, vitest, @vitest/coverage-v8, vite, eslint, typescript-eslint, prettier, playwright, @playwright/test, zod, @types/node, tslib, swc).
4. **TypeScript**: `tsconfig.base.json` with `strict`, `module`/`moduleResolution: nodenext`, `composite`, `declarationMap`, `isolatedModules`, `noUnusedLocals`, `noImplicitReturns`, `noImplicitOverride`, `target es2023`, **`customConditions: ["@clear-a11y/source"]`**, and **no `paths`**. Root `tsconfig.json` holds `references` (empty for now), maintained by `nx sync`.
5. **Custom export condition** `@clear-a11y/source`: every package's `exports["."]` will be `{ "@clear-a11y/source": "./src/index.ts", "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" }`. Vitest configs must set `resolve.conditions` to include it so tests run against source without a prior build.
6. **Nx plugins (inferred tasks)** in `nx.json`: `@nx/js/typescript` (`build` from `tsconfig.lib.json`, `typecheck`), `@nx/vitest` (`test`), `@nx/eslint/plugin` (`lint`), `@nx/playwright/plugin` (`e2e`).
7. **Named inputs**: `default` = `{projectRoot}/**/*` + `sharedGlobals`; `production` = `default` minus tests/specs, `test/**`, `e2e/**`, `tsconfig.spec.json`, vitest/playwright configs, `eslint.config.mjs`, README; `sharedGlobals` = `tsconfig.base.json`, `pnpm-workspace.yaml`, Node major version (runtime input).
8. **targetDefaults** with `cache: true` and accurate inputs/outputs for `build` (`dependsOn: ["^build"]`, `production`, `^production`), `typecheck`, `lint` (+ root `eslint.config.mjs`), `test`, `e2e`, and **`test-integration`** (explicit default: `nx:run-commands` running `vitest run -c vitest.integration.config.mts` in `{projectRoot}`, inputs include `{workspaceRoot}/fixtures/**/*`). Leave a `bench:run`-shaped default for S00c to fill in (or add it in S00c).
9. **ESLint flat config** (`eslint.config.mjs`) with `@nx/enforce-module-boundaries`:

   | Source tag         | onlyDependOnLibsWithTags                                             |
   | ------------------ | -------------------------------------------------------------------- |
   | `type:app`         | feature, engine, data-access, util                                   |
   | `type:feature`     | feature, engine, data-access, util                                   |
   | `type:engine`      | data-access, util                                                    |
   | `type:data-access` | util                                                                 |
   | `type:util`        | util                                                                 |
   | `type:test`        | data-access, util                                                    |
   | `type:tool`        | feature, engine, data-access, util, test, tool (anything except app) |
   | `publish:public`   | publish:public                                                       |

   Plus a **second, file-scoped entry** for test files (`**/*.test.ts(x)`, `**/*.spec.ts(x)`, `**/test/**`, `**/e2e/**`, `**/vitest*.config.mts`, `**/playwright.config.ts`) whose constraints add `type:test` and allow `publish:private`, so production code can never import `test-utils`. `@typescript-eslint/no-explicit-any: error`. Ignore `fixtures/site/**`, `fixtures/repos/**`, `bench-results/**`, `dist`, `coverage`.

10. **Prettier**: `.prettierrc`, `.prettierignore` (ignore lockfile, dist, fixtures/site, bench-results, CHANGELOG.md); root scripts `format` and `format:check`; `eslint-config-prettier` in the flat config.
11. **nx release**: `projects: ["tag:publish:public"]`, `projectsRelationship: "fixed"`, `version.conventionalCommits: true`, `releaseTag.pattern: "v{version}"`, workspace changelog at `CHANGELOG.md` (no per-project changelogs), GitHub release creation for CI. Publishing is CI-only (never run without `--dry-run` locally).

## Out of scope

Any library or app project, generators (S00b), CI workflows and community files (S00d), the bench target body (S00c), Nx Cloud.

## Files to create/change

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- `nx.json`, `tsconfig.base.json`, `tsconfig.json`
- `eslint.config.mjs`, `.prettierrc`, `.prettierignore`
- `vitest.config.mts` (root workspace config, optional), `.vscode/extensions.json`
- `.gitignore` (append Nx/Vitest entries only; keep existing lines)
- `docs/DECISIONS.md` (record anything you had to choose, e.g. exact versions, Nx flags)

## Tests

No unit tests in this slice. Prove the config instead:

- A throwaway lib generated with `@nx/js:library` in a scratch branch (or a temporary project you delete before committing) shows inferred `build`, `typecheck`, `lint`, `test` in `pnpm nx show project <name>`.
- A deliberate bad import (engine-tagged project importing another engine-tagged project) fails `lint`; then remove it.

## Fixtures + expected findings

None in this slice.

## Docs to update

- `docs/DECISIONS.md`: toolchain versions actually installed, any Nx 24 flag changes.
- `AGENTS.md` Commands section only if a command differs from what is listed (S00d does the full pass).

## Acceptance criteria

- [ ] `pnpm install` succeeds from a clean clone with no Nx Cloud prompt.
- [ ] `pnpm nx run-many -t lint typecheck test build` succeeds (zero projects is fine; no config errors).
- [ ] `pnpm nx sync:check` passes.
- [ ] `pnpm nx format:check` (or `pnpm format:check`) passes.
- [ ] Temporary-project check shows inferred targets and a boundary violation failing `lint`.
- [ ] `pnpm nx release --dry-run` parses the config. If it refuses because no `publish:public` project exists yet, note it in `docs/PROGRESS.md` Notes; S00c re-runs it once `core` exists.
- [ ] No `paths` in any tsconfig; no `nxCloudId` in `nx.json`.
- [ ] `pnpm nx run bench:run` delta: not applicable (no bench yet).

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- Project tags: every project gets `type:*`, `scope:*`, `publish:*` in its `package.json` `nx.tags`. This slice writes the constraints that enforce them; later slices rely on them being exactly the table above.
- Engines never import other engines; coordination lives in `@clear-a11y/runner`; no detection logic in `apps/`. The engine contract (`run(ctx: PageContext): Promise<Finding[]>`, types in `@clear-a11y/browser`) arrives in S01.
- Offline: after `pnpm install`, build/test must not touch the network. No secrets, no Nx Cloud.
- Conventional commits, e.g. `build: create Nx workspace ...`.

### Pitfalls and hints

- The repo already has files, so `create-nx-workspace` cannot target it directly. Either generate a `--preset=ts` workspace in a scratch directory and copy the config files across, or `pnpm add -D nx@24` and `pnpm nx init`, then add plugins with `pnpm nx add @nx/js` etc. Check `--help` for Nx 24 flag names rather than trusting memory; pass `--nxCloud=skip` / set `NX_NO_CLOUD=true`.
- `nx add` may write `paths` or a `nxCloudId`; remove them.
- In the ESLint flat config, a later config object fully replaces the rule options of an earlier one for matching files. The test-file entry must therefore repeat the whole `depConstraints` list (derive it in code from the base list).
- `publish:public` constraints combine with `type:*` constraints (a project must satisfy both).
- Keep `nx.json` minimal: prefer plugin options over per-project targets. `test-integration` is the one explicit default, because no plugin infers it.
- Vitest config files use the `.mts` extension so they load as ESM regardless of the project's `type`.
