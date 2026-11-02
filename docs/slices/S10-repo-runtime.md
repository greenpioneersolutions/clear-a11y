# S10: Repo runtime layer

## Goal

Let `clear-a11y scan <repo-path>` test a repo's UI at runtime with the full engine set: if the repo has Storybook, scan every story (each story is a page, with source mapped from the story's file); otherwise detect the framework, start the repo's dev server on request, and crawl it like a site. Tests stay fully offline with hand-built fixtures that follow the real Storybook and dev-server contracts. Read the ground rules in "Notes" first.

## Wave

Wave 4, **parallel** with S08 and S09. Builds on `@clear-a11y/repo` from S09: merge S09 first and rebase this slice on it.

## Projects

| Project              | Path              | Package              | Tags                                             | Status                             |
| -------------------- | ----------------- | -------------------- | ------------------------------------------------ | ---------------------------------- |
| `@clear-a11y/repo`   | `packages/repo`   | `@clear-a11y/repo`   | `type:feature`, `scope:repo`, `publish:public`   | touched (`runtime/`)               |
| `@clear-a11y/runner` | `packages/runner` | `@clear-a11y/runner` | `type:feature`, `scope:runner`, `publish:public` | touched (`scanRepo` runtime phase) |
| `cli`                | `apps/cli`        | `clear-a11y`         | `type:app`, `scope:cli`, `publish:public`        | touched (flags only)               |

## Depends on

S09 (`detectRepo`, `scanRepo`, `mapFindingsToSource`, repo Finding conventions), S01–S05 (full engine set via the runner), S03 (states run per story too).

## Scope

**Storybook** (`packages/repo/src/runtime/storybook.ts`):

- Detect: `.storybook/` directory or `storybook`/`@storybook/*` in package.json.
- Source of stories, in order: (1) a built `storybook-static/` (or `config.repo.storybookStatic` path) containing `index.json` (Storybook 7+, `v: 5`; also accept legacy `stories.json`); (2) a running Storybook at `config.repo.storybookUrl` (fetch `<url>/index.json` from localhost only). We never run `storybook build` ourselves in this slice.
- Serve `storybook-static/` with a local static server; for every entry with `type: "story"` (skip `docs`), target URL `iframe.html?id=<id>&viewMode=story`; wait for the story to render (`#storybook-root` has children, or the `storyRendered` channel event if exposed).
- Each story becomes a scan target: `page.state = "story:<id>"`; findings get `source = { file: entry.importPath (repo-relative), line: 1, component: entry.title }` unless a more precise mapping from `mapFindingsToSource` exists. Story-level opt-outs: `index.json` doesn't carry story parameters, so don't try to honor `parameters.a11y`; use `repo.storyFilter` for exclusions.
- Limits: `repo.maxStories` (default 200), filter with `repo.storyFilter` glob on id/title.

**Dev server** (`packages/repo/src/runtime/dev-server.ts`):

- Framework detection (pure `detectFramework(pkg)`): Next.js (`next dev -p <port>`), Vite (`vite --port <port> --strictPort`), CRA (`react-scripts start` with `PORT`), Astro (`astro dev --port`), Angular (`ng serve --port`), Vue CLI (`vue-cli-service serve --port`), SvelteKit (`vite dev --port`), fallback `npm run dev` with `PORT` env.
- Safety: starting a dev server executes the repo's code. Require explicit opt-in: `--run-dev-server` / `repo.runtime: "dev-server"`. Never run `install`; if `node_modules` is missing, stop with a clear message. Use the repo's package manager (lockfile detection) only to run the script. Bind to `127.0.0.1`, pick a free port, pass `BROWSER=none`, `CI=1`.
- Wait for readiness by polling `http://127.0.0.1:<port>/` (timeout `repo.devServerTimeoutMs`, default 120s) and watching stdout for the URL; then run the normal site scan (crawler limited to that origin, `maxPages`), with `mapFindingsToSource` applied. Kill the whole process tree on finish, error or SIGINT (`detached` + `process.kill(-pid)` on POSIX; `taskkill /T` on Windows).

**Selection** `chooseRuntime(detection, config)`: `storybook-static` if present → running Storybook URL if configured → dev server if opted in → static-only (S09) with a note in the result explaining how to enable runtime scanning.

**CLI**: `clear-a11y scan <repo-path> [--storybook-static <dir>] [--storybook-url <url>] [--run-dev-server] [--max-stories n]`.

## Out of scope

Building Storybook, installing dependencies, Docker sandboxes for untrusted repos (record as a follow-up idea), Storybook interaction tests (`play` functions) as states (v0.2 candidate), monorepos with multiple apps (scan the first match; note the limit).

## Files to create/change

`packages/repo/src/runtime/{storybook.ts,index-json.ts,dev-server.ts,frameworks.ts,process.ts,choose.ts}` + tests; `packages/repo/test/{storybook.integration.test.ts,dev-server.integration.test.ts}`; `packages/runner/src/repo.ts`; `apps/cli/src/commands/scan.ts`; `fixtures/repos/storybook-sample/**`, `fixtures/repos/node-dev-sample/**`, `fixtures/expected/repos/**`; docs.

## Tests

- Unit: `index.json` parsing (v5 and legacy), story URL building and id escaping, story filter, `detectFramework` table, command/port/env building per framework, readiness polling with a fake clock, process-tree kill helper (mocked `child_process`), `chooseRuntime` decision table.
- Integration (offline):
  - Storybook: `fixtures/repos/storybook-sample/storybook-static/` is a **hand-built minimal fake** of the Storybook contract: `index.json` (v5) with 4 stories and an `iframe.html` that reads `?id=` and renders the matching component markup into `#storybook-root` with plain inline JS. Scanning it yields seeded findings with `source.file` = the story's `importPath`.
  - Dev server: `fixtures/repos/node-dev-sample/` has `package.json` with `"dev": "node server.mjs"` and a `server.mjs` using only `node:http` that reads `PORT` and serves two pages with seeded issues; `node_modules` absent but not needed (assert the "missing node_modules" check is skipped when the package has no dependencies). Test runs with `--run-dev-server`, finds issues, and verifies the process is gone afterwards.
  - Without the opt-in flag, the dev server is never started (spy on spawn).

## Fixtures + expected findings

- `fixtures/repos/storybook-sample/`: `src/components/Button.stories.tsx`, `Card.stories.tsx` (source files for mapping only), `storybook-static/{index.json,iframe.html}`. Stories: `button--icon-only` (no accessible name, 4.1.2), `button--primary` (ok), `card--low-contrast` (1.4.3), `card--default` (ok).
- `fixtures/repos/node-dev-sample/`: `server.mjs` pages `/` (link without name, 2.4.4/4.1.2) and `/form` (input without label, 1.3.1).
- Expected: `fixtures/expected/repos/storybook-sample.json` (page = `repos/storybook-sample/storybook-static/iframe.html?id=<id>` or match by `source.file`; use the source matching from S09), `fixtures/expected/repos/node-dev-sample.json`, `layer: "repo"`.
- Mark both trees in `.nxignore` (already covers `fixtures/repos/`).

## Docs to update

`packages/repo/README.md` (runtime modes, safety: when repo code runs, opt-in flags), CLI README, fixtures README (fake Storybook contract), `docs/DECISIONS.md` (no auto-install, no auto-build, opt-in dev server).

## Acceptance criteria

- [ ] Storybook-static scan produces findings per story with `source.file` from `importPath`; ok stories are clean.
- [ ] Dev-server scan works only with the opt-in flag, never installs, and always cleans up the process tree (tested).
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; repo `test-integration` passes offline; `pnpm nx sync:check` passes.
- [ ] `pnpm nx run bench:run` includes the new repo fixtures; precision of `violation` ≥ 0.95; record the delta.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract:** engines implement `run(ctx: PageContext): Promise<Finding[]>` with `PageContext` from `@clear-a11y/browser`; this slice doesn't write engines, it feeds the runner new targets (stories, dev-server pages).
- **Tags/boundaries:** `repo` and `runner` are `type:feature`; the CLI (`type:app`) only parses flags and calls runner. Engines never import engines. `publish:public` → public only. Test files may import `test-utils`.
- **No detection logic in `apps/`.**
- **Tiers:** unchanged; findings come from existing engines.
- **Untrusted repos:** running a repo's dev server runs its code: opt-in only, never install, bind to localhost.
- **Offline:** no real Storybook build, no package installs, no network; localhost only.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`.

### Pitfalls and hints

- `index.json` `importPath` starts with `./`; normalize to repo-relative POSIX.
- Story iframes may render asynchronously; wait for content, not a timeout.
- Dev servers print ANSI color codes and may choose a different port if busy; use `--strictPort`-style flags where available and parse stdout defensively.
- On macOS/Linux, spawn with `detached: true` and kill the process group; child watchers (esbuild, webpack) otherwise survive.
