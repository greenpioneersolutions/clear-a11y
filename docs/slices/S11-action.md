# S11: GitHub Action

## Goal

Ship `apps/action`, a GitHub Action that scans what a pull request changed (routes of a preview/started app, Storybook stories of changed components, and static repo lint of changed files), writes SARIF for code scanning and a readable Markdown job summary, and sets outputs that can fail the job on `violation`s. It needs no Clear A11Y account and no token beyond what the user's workflow already has. Read the ground rules in "Notes" first.

## Wave

Wave 5, **parallel** with S12 and S13. Runs in its own git worktree.

## Projects

| Project                | Path                | Package                | Tags                                               | Status                                                                     |
| ---------------------- | ------------------- | ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `action`               | `apps/action`       | `@clear-a11y/action`   | `type:app`, `scope:action`, `publish:private`      | created (`@nx/js:library` or `@nx/node:application`, bundled with esbuild) |
| `@clear-a11y/runner`   | `packages/runner`   | `@clear-a11y/runner`   | `type:feature`, `scope:runner`, `publish:public`   | touched only if a `changedTargets` helper is needed                        |
| `@clear-a11y/reporter` | `packages/reporter` | `@clear-a11y/reporter` | `type:feature`, `scope:reporter`, `publish:public` | touched (`toMarkdownSummary`)                                              |

## Depends on

S06 (SARIF + HTML), S09/S10 (repo static + Storybook runtime, source mapping), S01 (runner/CLI).

## Scope

**`action.yml`** (`apps/action/action.yml`): `runs.using: node24` (verify GitHub supports it at implementation time; else `node20`) with `main: dist/index.js`. Inputs:

- `url` (base URL of a running app/preview, optional), `routes` (newline list, optional), `route-map` (path to JSON/YAML mapping source globs → routes),
- `repo-path` (default `.`), `storybook-static` (dir, optional), `changed-only` (default `true`),
- `config` (path to `clear-a11y.config.json`), `fail-on` (`violation` | `likely` | `never`, default `violation`),
- `sarif-file` (default `clear-a11y.sarif`), `report-dir` (default `clear-a11y-report`), `max-pages`.
  Outputs: `violations`, `likely`, `needs-review`, `sarif-file`, `report-dir`, `scanned-targets`.

**Changed files** (`src/changes.ts`, pure where possible):

- Read the event from `GITHUB_EVENT_PATH`. For `pull_request` events use `pull_request.base.sha` and `pull_request.head.sha`; for `push`, `before`/`after`. Compute the list with local `git diff --name-only <base>...<head>` (requires `fetch-depth: 0` in the user's checkout; detect and explain if history is missing). No GitHub API calls, no token needed.

**Target selection** (`src/targets.ts`, pure):

- Static lint: changed files matching the repo layer's source globs.
- Storybook: stories whose `importPath` is a changed file, or a story file next to/importing a changed component (same basename heuristic: `Button.tsx` → `Button.stories.tsx`).
- Routes: from `route-map` globs; plus Next.js conventions (`app/**/page.tsx` → route, `pages/**.tsx` → route) when detected; plus explicit `routes`. If `changed-only` is false or nothing maps, scan `url` with the crawler and `max-pages`.

**Run**: call runner (`scan`, `scanRepo`) — no analysis in the app — then reporter: write SARIF, HTML report to `report-dir`, and append `toMarkdownSummary(result, { maxRows: 50 })` to `GITHUB_STEP_SUMMARY`: counts by tier, table of violations (rule, SC, page/file:line, message), a collapsible needs-review list, link text pointing to the uploaded artifact name. Set outputs with `@actions/core`; `core.setFailed` when findings ≥ `fail-on`.

**Browsers**: document that the workflow must install Chromium (`npx playwright install --with-deps chromium`) before the action; the action checks `chromium.executablePath()` and fails with that instruction if missing. Provide an example workflow with checkout (fetch-depth 0), setup-node, browser install, the action, `github/codeql-action/upload-sarif`, and `actions/upload-artifact` for the HTML report.

**Bundle**: esbuild single-file bundle at `apps/action/dist/index.js` with all JS dependencies inlined (GitHub runs `main` without installing anything). Bundle `playwright-core`; browsers come from the documented install step. If a dependency can't be bundled, record why and the workaround in `docs/DECISIONS.md`. The `build` target produces the bundle; committing it for releases is wave 7's job.

## Out of scope

PR review comments / inline suggestions ("PR agent" mode), Marketplace publishing, starting dev servers inside the action (users start their app or use previews), AI judges in CI by default (allowed via config + user secret, not tested).

## Files to create/change

`apps/action/{action.yml,package.json,README.md,src/{main.ts,inputs.ts,changes.ts,targets.ts,outputs.ts,index.ts},test/**,examples/workflow.yml}`; `packages/reporter/src/markdown/summary.ts` + tests; `fixtures/action/{pull_request.json,push.json}` event payloads and a tiny git repo builder for tests; docs.

## Tests

- Unit: input parsing and validation, event parsing (PR, push, missing SHAs), changed files → targets (route-map globs, Next.js conventions, story matching), summary Markdown (escaping of `|`, backticks, `<`, newlines; row cap), fail-on logic.
- Integration (offline): create a temp git repo in the test (`git init`, two commits changing `src/components/Button.tsx`), write a simulated `pull_request` event JSON with base/head SHAs, set `GITHUB_EVENT_PATH`, `GITHUB_STEP_SUMMARY`, `GITHUB_OUTPUT` to temp files and `INPUT_*` env vars, point `url` at the fixture server and `storybook-static` at `fixtures/repos/storybook-sample/storybook-static`, call `run()` in-process. Assert: SARIF file valid, summary written, outputs set, exit status matches `fail-on`.
- Bundle smoke test: `node apps/action/dist/index.js` with the same env runs end to end.

## Fixtures + expected findings

No new barrier pages. Reuse `fixtures/repos/storybook-sample` and `fixtures/site/static/*`. Event payloads under `fixtures/action/` (add `fixtures/action/**` to the fixture-integrity test's ignore list, since they're not pages).

## Docs to update

`apps/action/README.md` (inputs/outputs table, example workflow, permissions: `contents: read`, `security-events: write` only for SARIF upload; fork PR behavior), reporter README (Markdown summary), `docs/DECISIONS.md` (node runtime, bundling approach, git-diff over API).

## Acceptance criteria

- [ ] `action.yml` valid; bundle builds with `pnpm nx build action`.
- [ ] Simulated PR event scans only targets mapped from changed files; SARIF + summary + outputs produced; job fails on violations with `fail-on: violation`.
- [ ] Markdown summary escapes page-derived text (tested).
- [ ] No network or GitHub API calls in tests; no token required.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; action `test-integration` passes; `pnpm nx sync:check` passes.
- [ ] `pnpm nx run bench:run` unchanged (no detection change); note "n/a".

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Apps are thin:** parse inputs, call `@clear-a11y/runner` and `@clear-a11y/reporter`, write outputs. No detection or target-scoring logic beyond mapping changed files to targets; if mapping grows, move it into `runner` or `repo`.
- **Tags/boundaries:** app → feature, engine, data-access, util. `action` is `publish:private`, so it may depend on public packages freely. Test files may import `test-utils`.
- **Tiers:** `violation` (may fail CI), `likely`, `needs-review`. Only `violation` fails by default. AI never `violation`.
- **Offline tests:** simulated events, temp git repos, localhost fixtures.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`.

### Pitfalls and hints

- `@actions/core` reads inputs from `INPUT_<NAME>` with spaces→underscores and upper-case; hyphens stay as hyphens.
- Never use `pull_request_target` in examples; fork PRs then get read-only tokens and SARIF upload may be skipped; document it.
- SARIF results without repo file locations aren't shown by code scanning; the summary and HTML report cover URL-only findings.
- Keep the bundle deterministic so wave 7 can commit it and diff it.
