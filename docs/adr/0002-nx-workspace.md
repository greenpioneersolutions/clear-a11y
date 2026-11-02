# ADR 0002: Nx workspace setup

- Status: Accepted
- Date: 2026-10-31

## Context

Clear A11Y has about 25 projects (libraries, apps, tools, fixtures) that need consistent builds, tests, boundaries and releases. Contributors must be able to clone a fork and build, test and benchmark offline, with no accounts.

## Decision

1. **Nx's TypeScript "solution" setup.** pnpm workspaces (`pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `packages/engines/*`, `tools/*`, `fixtures`). TypeScript project references, kept in sync by `nx sync`. No `paths` aliases in `tsconfig.base.json`. Internal dependencies use `workspace:*`.
2. **ESM everywhere.** `"type": "module"`, `module`/`moduleResolution` `nodenext`, TypeScript `strict`. Each package's `exports` map has a workspace-only custom condition (`@clear-a11y/source`) pointing at `src/index.ts` so tests and type-checking resolve source without a prior build, plus `types`/`import`/`default` pointing at `dist/` for consumers.
3. **Single version policy.** Third-party versions live in the pnpm `catalog:` in `pnpm-workspace.yaml`. Packages reference `catalog:`. No per-project version drift.
4. **Inferred tasks.** Nx plugins: `@nx/js/typescript` (`build`, `typecheck`), `@nx/vitest` (`test`), `@nx/eslint/plugin` (`lint`), `@nx/playwright/plugin` (`e2e`), `@nx/nest` for the server app. Explicit targets only for custom work (`bench:run`, `fixtures:serve`, `test-integration`).
5. **Caching.** Named inputs in `nx.json`: `default` (all project files + shared globals) and `production` (excludes tests, specs, fixtures-in-tests, configs). Target defaults set inputs/outputs for `build`, `test`, `test-integration`, `lint`, `typecheck`, `bench:run`. Tests don't depend on wall-clock or network.
6. **Releases with `nx release`.** Conventional commits drive versions and changelogs. All `publish:public` projects version together (fixed group) until 1.0. Publishing happens only from CI with npm provenance; locally we only run `nx release --dry-run`.
7. **Nx Cloud is optional.** No `nxCloudId` / access token is committed. CI works on forks with no secrets.
8. **Integration tests.** Unit tests (`src/**/*.test.ts`) run in `test` and never launch a browser. Browser tests (`test/**/*.integration.test.ts`) run in a `test-integration` target backed by `vitest.integration.config.ts`. App end-to-end tests use `e2e` (Playwright).

## Consequences

- `nx sync:check` in CI catches missing project references.
- Contributors need only `pnpm install` and (for browser tests) `pnpm exec playwright install chromium`.
- The custom export condition means a package's `src` is only reachable inside the workspace; published packages ship `dist` only.

## Alternatives considered

- **tsconfig path aliases (the older Nx "integrated" style)**: simpler to start, but diverges from how packages resolve once published and is no longer Nx's recommendation.
- **Independent versioning**: more precise, but noisy before 1.0 with tightly coupled packages.
- **Turborepo / plain pnpm scripts**: lacks module-boundary enforcement and generators that we rely on for consistency.
