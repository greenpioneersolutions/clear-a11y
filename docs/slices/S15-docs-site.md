# S15: Documentation site

## Goal

Build `apps/docs`, the user documentation site: getting started, CLI, repo scanning, MCP/agent usage, desktop, providers, architecture, how coverage is measured (with the live benchmark table), a rules reference generated from rule metadata and `docs/rules/**`, a CLI reference generated from the CLI definition, and contributor guides. Deploy it to GitHub Pages. The site must pass Clear A11Y with zero `violation`s. Read the ground rules in "Notes" first.

## Wave

Wave 6, **parallel** with S14. Runs in its own git worktree.

## Projects

| Project              | Path              | Package              | Tags                                             | Status                                             |
| -------------------- | ----------------- | -------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `docs`               | `apps/docs`       | `@clear-a11y/docs`   | `type:app`, `scope:docs`, `publish:private`      | created                                            |
| `cli`                | `apps/cli`        | `clear-a11y`         | `type:app`, `scope:cli`, `publish:public`        | touched (`docs:cli` target emitting JSON)          |
| `@clear-a11y/runner` | `packages/runner` | `@clear-a11y/runner` | `type:feature`, `scope:runner`, `publish:public` | touched only if `allRules()` needs fields for docs |

## Depends on

All engine slices (rule metadata and `docs/rules/**`), S01/S06 (CLI with `createProgram()`), S00c (bench results), S13/S14 (content for MCP and desktop pages). Missing pieces become clearly marked "coming soon" sections, not broken links.

## Scope

**Framework**: recommended **Astro Starlight** (static output, accessible defaults: skip link, landmarks, keyboard-friendly nav, dark mode, offline Pagefind search, no client framework required). Confirm it meets our needs (version compatible with the workspace's Node/Vite, builds offline, no remote fonts/scripts), then record the choice and alternatives (Docusaurus, VitePress) in `docs/DECISIONS.md`. Disable telemetry (`ASTRO_TELEMETRY_DISABLED=1` in targets).

**Nx targets** (explicit, since there's no official Astro plugin): `build` (`astro build`, outputs `{projectRoot}/dist`), `serve` (`astro dev`, continuous), `preview`, `generate` (runs before build: rules + CLI reference + benchmark data), `test` (Vitest for generators), `test-integration` (dogfood scan). Inputs for `generate`/`build` include `{workspaceRoot}/docs/rules/**/*`, `{workspaceRoot}/bench-results/latest.json`, and the CLI reference JSON.

**Content** (`apps/docs/src/content/docs/`), written plainly for web developers new to accessibility:

- Getting started (install, first scan of a local site, reading the report, tiers explained), CLI guide, scanning repos (static, Storybook, dev server opt-in, source mapping), MCP and agents (Claude Code setup, SKILL loop), Desktop, AI providers (BYO model, privacy, `none` default, no subscription login, Ollama), Configuration reference (from core's config Zod schema → generated table), Architecture (engines, runner pipeline, tiers, evidence), **How coverage is measured** (method, fixtures, matching rule, precision/recall definitions, recall by SC and by layer table generated from `bench-results/latest.json`, honest caveat that fixtures are seeded, link to reproduce with `pnpm nx run bench:run`), Contributing (add a rule with the generator, add an engine, fixtures and benchmark, release process summary), FAQ.

**Generated pages** (`apps/docs/scripts/`, pure functions + thin I/O, gitignored outputs under `src/content/docs/reference/`):

- **Rules reference**: one page per rule from `runner.allRules()` (id, title, engine, WCAG SC with Understanding links from core's WCAG map, tier) merged with the body of `docs/rules/<engine>/<rule>.md`; index page grouped by SC and by engine. Fail the generator if a rule has no doc file or a doc has no rule (drift check).
- **CLI reference**: the `cli` project gets a `docs:cli` target that calls `createProgram()` and writes `apps/cli/dist/cli-reference.json` (commands, arguments, options, defaults, descriptions). The docs `generate` target reads that JSON file (declared via `dependsOn: ["cli:docs:cli"]`), because an app may not import another app.
- **Benchmark table**: from `bench-results/latest.json`.

**Deploy**: `.github/workflows/docs.yml` — on push to `main` (paths: `apps/docs/**`, `docs/rules/**`, `bench-results/**`, engines' rules) and manual dispatch: install, `pnpm nx run docs:build`, `actions/upload-pages-artifact`, `actions/deploy-pages`; `permissions: pages: write, id-token: write, contents: read`; `concurrency: pages`. Astro `site`/`base` set for `https://<org>.github.io/clear-a11y/` via env so forks work.

**Dogfood**: `test-integration` builds the site, serves `dist/` with the test-utils fixture server, crawls all pages with `runner.scan` (all deterministic engines, desktop + mobile viewports), asserts zero `violation`s, and writes a summary. Add the job to `docs.yml` before deploy.

## Out of scope

Versioned docs, i18n, blog, hosting other than GitHub Pages, API reference via TypeDoc (optional later).

## Files to create/change

`apps/docs/{package.json,astro.config.mjs,README.md,src/content/docs/**,src/content.config.ts,scripts/{generate-rules.ts,generate-cli.ts,generate-bench.ts,generate-config.ts},scripts/*.test.ts,test/dogfood.integration.test.ts,public/**}`; `apps/cli/package.json` (`docs:cli` target), `apps/cli/src/docs-json.ts`; `.github/workflows/docs.yml`; `.gitignore` (generated reference dir); root `README.md` (docs link); `docs/DECISIONS.md`.

## Tests

- Unit: rules generator (merge metadata + markdown, drift detection both directions, SC links), CLI reference renderer from a sample JSON, benchmark table renderer (null precision, deltas), config table from a sample Zod schema.
- Integration: `pnpm nx run docs:build` succeeds offline; dogfood scan zero `violation`s; a link checker over `dist/` (internal links only, no network) reports no broken links.

## Fixtures + expected findings

No new barrier pages. Optionally commit one built docs page under `fixtures/site/docs/` as a correct-pattern page (`correctPattern: true`) so the benchmark guards the site's markup.

## Docs to update

This slice is docs. Also: `CONTRIBUTING.md` (where user docs live, how generated pages work), `AGENTS.md` Commands (`pnpm nx run docs:serve`, `docs:build`), `docs/DECISIONS.md`.

## Acceptance criteria

- [ ] Framework choice recorded in `docs/DECISIONS.md`.
- [ ] All listed pages exist; rules and CLI reference are generated and fail on drift.
- [ ] `pnpm nx run docs:build` works offline; no external requests at runtime (fonts/scripts local).
- [ ] Dogfood scan of the built site: zero `violation`s; internal links valid.
- [ ] `docs.yml` deploys to GitHub Pages with least-privilege permissions and runs the dogfood scan first.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `pnpm nx sync:check` passes; `docs` does not import `cli`.
- [ ] `pnpm nx run bench:run` unchanged unless a docs fixture page was added (then record the delta).

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Tags/boundaries:** app → feature, engine, data-access, util. **Apps may not import apps**: the CLI reference comes from a JSON artifact, rules from `@clear-a11y/runner`'s `allRules()` plus files in `docs/rules/`. `docs` is `publish:private`.
- **No detection logic in `apps/`.** Engines never import engines.
- **Tiers** must be explained exactly: `violation` (deterministic, can fail CI), `likely`, `needs-review` (yes/no question). AI never `violation`.
- **Provider policy** must be stated: bring your own model; no consumer chat-subscription login; default `none`.
- **Practice what we test:** zero `violation`s on the site.
- **Offline:** build and tests without network; deploy happens in CI only.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`.

### Pitfalls and hints

- Starlight's built-in components are accessible but custom MDX components may not be; scan early.
- Code blocks (Expressive Code) need sufficient contrast in both themes; check the chosen theme with the dogfood scan.
- Base path handling: every internal link must respect `base` or GitHub Pages breaks under `/clear-a11y/`.
- Generated content must be deterministic (stable ordering) so Nx caching works.
