# S01: First scan

## Goal

Deliver the first end-to-end scan: `clear-a11y scan <url>` opens pages with Playwright, runs an axe-core engine, applies the tier policy and writes canonical JSON; `clear-a11y bench` and `pnpm nx run bench:run` score real findings. Record the **axe-only baseline** that every later wave must beat. This slice also fixes the shared contracts (`PageContext`, `Engine`, runner pipeline, engine registry) that the parallel Wave 2 slices build on. Read the ground rules in "Notes" first.

## Wave

Wave 1, **serial** (last slice of the foundation).

## Projects

| Project                     | Path                      | Package                     | Tags                                                  | Status                             |
| --------------------------- | ------------------------- | --------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `@clear-a11y/browser`       | `packages/browser`        | `@clear-a11y/browser`       | `type:data-access`, `scope:browser`, `publish:public` | created                            |
| `@clear-a11y/crawler`       | `packages/crawler`        | `@clear-a11y/crawler`       | `type:feature`, `scope:crawler`, `publish:public`     | created                            |
| `@clear-a11y/engine-static` | `packages/engines/static` | `@clear-a11y/engine-static` | `type:engine`, `scope:static`, `publish:public`       | created (engine generator)         |
| `@clear-a11y/reporter`      | `packages/reporter`       | `@clear-a11y/reporter`      | `type:feature`, `scope:reporter`, `publish:public`    | created                            |
| `@clear-a11y/runner`        | `packages/runner`         | `@clear-a11y/runner`        | `type:feature`, `scope:runner`, `publish:public`      | touched (exists with `benchmark/`) |
| `cli`                       | `apps/cli`                | `clear-a11y`                | `type:app`, `scope:cli`, `publish:public`             | created                            |
| `bench`                     | `tools/bench`             | `@clear-a11y/bench`         | `type:tool`, `scope:bench`, `publish:private`         | touched                            |

## Depends on

S00a–S00c (S00d may land before or after; no overlap).

## Scope

**browser** (`@nx/js:library`; dep `playwright`):

- Types: `PageContext { page, url, state, viewport: {name,width,height}, config: ClearA11yConfig, artifacts: ArtifactSink, log: Logger, stateMeta?: StateMeta }`, `StateMeta { kind: string; triggerSelector?: string; replay?: (page: Page) => Promise<void> }`, `Engine { name; run(ctx): Promise<Finding[]> }`, `ArtifactSink { saveScreenshot(name, buffer): Promise<string /* relative path */> }`, `Logger`.
- `stateMeta` is an **additive, optional** extension of the ADR 0001 contract, set by the runner when a page is in a non-default state, so engines can re-open the state (focus return, announcements) without importing `engine-states`. Record it in `docs/DECISIONS.md` and add an "Amendment" note to ADR 0001.
- `launchBrowser({ headless })`, `createSession(browser, { viewport, storageState? })` (auth via Playwright storage state file path; never commit one), `VIEWPORTS` (desktop 1280×800, mobile 375×812, reflow 320×256), `getCdpSession(page)`, `selectorFor(elementHandle)` (the one shared stable-selector helper: `#id` if unique, else a short CSS path through stable attributes; every engine uses it so dedupe and benchmark matching line up), `FsArtifactSink(outDir)`, `MemoryArtifactSink`, `consoleLogger`, `silentLogger`.

**crawler** (`@nx/js:library`): `discoverUrls({ start, include?: string[], maxPages, browser })`: BFS over same-origin `a[href]`, plus the explicit list; normalize (strip hash, sort query, drop trailing slash), skip non-HTML (by extension), `mailto:`/`tel:`/`javascript:`; never leave the start origin(s). Pure helpers `normalizeUrl`, `isSameOrigin`, `shouldVisit` unit-tested. Explicit target list only; never crawl beyond what the user named.

**engine-static** (`nx g @clear-a11y/workspace-plugin:engine static`; deps `@axe-core/playwright`, `axe-core`):

- Run axe with WCAG 2.0/2.1/2.2 A+AA tags. Map each node → Finding: `ruleId: static/<axe-id>`, `wcag` from tags (`wcag143` → `1.4.3`, `wcag1411` → `1.4.11`; drop results with no SC unless `static.bestPractices` is true, in which case skip them anyway since `wcag` must be non-empty), `target.selector` from axe's target (first frame path joined), `evidence.html` (truncated to 500 chars), `message` from `help` + `failureSummary`, `fix` from `helpUrl`.
- Tier mapping: axe `violations` → `violation` (confidence 0.9; lower to 0.7 and tier `likely` for rules axe tags `experimental`); axe `incomplete` → `needs-review` with a `question` built from the rule (e.g. "Is the text at this selector readable against its background?").
- Pure `mapAxeResults(results, ctx-ish)` and `tagsToWcag(tags)` with unit tests on recorded axe JSON.
- Rule metadata: one `RuleMeta` per axe rule used is too many to generate by hand; export a generated `rules` list from axe's rule metadata at build time or at runtime (`axe.getRules()`), and one doc page `docs/rules/static/index.md` explaining the mapping.

**reporter**: `toJson(result): string` (canonical, stable key order, findings sorted by tier → SC → selector) and `ScanResult` type `{ tool: {name, version}, startedAt, finishedAt, targets, findings, errors, summary: {violation, likely, needsReview, byEngine} }`. Clock is injected so tests are deterministic.

**runner**:

- `src/engines.ts`: the **engine registry** — an array of `{ name, create(config) }`, one line per engine. Wave 2 slices each add one line here.
- `scan({ targets, config, engines?, browser? })`: crawl → for each viewport → for each URL → for each enabled engine: **fresh navigation per engine** (`page.goto(url, { waitUntil: 'load' })` + replay of state if any) so interactive engines may mutate the page; collect findings; catch engine errors into `errors[]` (never crash the scan); compute ids with `findingId`; **dedupe** by id and merge cross-engine duplicates (same selector + overlapping SC + same page/state/viewport: keep the one with the highest tier, then confidence; append "Also found by: engine-x." to its `message`, since `Finding.engine` is a single string); apply `enforceTierPolicy`. Returns `ScanResult`.
- Pipeline hooks reserved for later slices: `discoverStates` (S03), `runJudges` (S07), `runPersonas` (S08), `mapToSource` (S09) as optional no-op steps.
- `bench` wiring: export `scanForBenchmark(urls, options)` used by `tools/bench` and the CLI.

**cli** (`apps/cli`, created with `@nx/js:library` + `bin` or `@nx/node:application`; ESM; `commander`):

- `clear-a11y scan <url...> [--max-pages n] [--viewport desktop,mobile] [--engines static] [--config clear-a11y.config.json] [--out .clear-a11y] [--fail-on violation|likely|never]`.
- `clear-a11y bench [--fixtures <dir>] [--expected <dir>] [--baseline <file>]` using runner's benchmark module.
- Exit codes: 0 ok, 1 findings at or above `--fail-on`, 2 usage/runtime error. Config loading validates with core's Zod schema and prints readable errors. No analysis logic in the app.
- Export `createProgram()` so S15 can emit a CLI reference JSON via a `docs:cli` target.

**bench**: replace the no-op scan with runner's scan; after the run, copy `latest.json` to `bench-results/baseline.json` (only in this slice) and fill the S01 row in `docs/PROGRESS.md`.

## Out of scope

Other engines, states, SARIF/HTML, AI, repo scanning, recorded flows, robots.txt handling, auth flows beyond loading a storage-state file.

## Files to create/change

`packages/browser/**`, `packages/crawler/**`, `packages/engines/static/**`, `packages/reporter/**`, `packages/runner/src/{scan.ts,engines.ts,dedupe.ts,index.ts}`, `apps/cli/**`, `tools/bench/src/**`, `docs/rules/static/index.md`, `bench-results/{baseline.json,latest.json,latest.md}`, `docs/DECISIONS.md`, `docs/adr/0001-architecture.md` (amendment note only), `docs/PROGRESS.md` (benchmark row), `AGENTS.md` Commands if `cli:scan` usage differs.

## Tests

- Unit: `tagsToWcag`, `mapAxeResults` (recorded axe JSON in `src/__fixtures__/`), crawler URL helpers, dedupe/merge, reporter ordering and JSON stability (snapshot), CLI arg parsing and exit-code mapping (with runner mocked).
- Integration (`test/**/*.integration.test.ts`, target `test-integration`): engine-static against `fixtures/site/static/img-missing-alt.html` (finds `static/image-alt`, tier `violation`) and `img-missing-alt-ok.html` (no violations); runner scan over two fixture pages with crawler limited to `maxPages`; crawler stays same-origin when a fixture links to `https://example.com`.
- e2e for cli (`@nx/playwright` not needed; a Vitest integration test spawning the built CLI against the fixture server is enough): exit code 1 with `--fail-on violation` on a barrier page, 0 on an ok page; JSON written to `--out`.

## Fixtures + expected findings

- Use the S00c seeds. Add `fixtures/site/static/low-contrast-text.html` → `low-contrast-text-ok.html` (1.4.3) and `fixtures/site/static/link-no-name.html` → `link-no-name-ok.html` (2.4.4, 4.1.2), plus a `fixtures/site/crawl/index.html` linking to two same-origin pages and one external link (expected files with `correctPattern: true`, `issues: []`).
- Fill real selectors in the S00c `static/*` expected files.

## Docs to update

READMEs for browser, crawler, engine-static, reporter, runner, cli; `docs/rules/static/index.md`; `docs/DECISIONS.md` (`stateMeta`, axe tier mapping, dedupe policy, per-engine fresh navigation); ADR 0001 amendment note; `docs/PROGRESS.md` baseline row.

## Acceptance criteria

- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `pnpm nx run-many -t test-integration` passes with Chromium installed.
- [ ] `pnpm nx sync:check` passes; `nx graph` acyclic; engine-static depends only on core + browser.
- [ ] `pnpm nx run cli:scan -- http://127.0.0.1:4400/static/img-missing-alt.html` (with `fixtures:serve` running) prints a summary and writes JSON.
- [ ] `pnpm nx run bench:run` produces real numbers; `bench-results/baseline.json` committed; S01 row filled in `docs/PROGRESS.md` (precision of violation, recall overall). Precision of `violation` ≥ 0.95 or the cause is documented.
- [ ] Every finding validates against core's Finding schema (assert in the runner in dev/test mode).

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract** (ADR 0001): `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`, `PageContext`/`Engine` in `@clear-a11y/browser`; `Finding`, WCAG map, config, `findingId`, `enforceTierPolicy` in `@clear-a11y/core` (no Playwright/AI deps).
- **Tags/boundaries:** app → feature, engine, data-access, util · feature → feature, engine, data-access, util · engine → data-access, util · data-access → util · util → util · test → data-access, util · tool → anything except app. `publish:public` depends only on `publish:public` (so browser, crawler, reporter, runner, engine-static must all be public: the CLI is public). Test files may also import `type:test`.
- **Engines never import engines**; coordination in `runner`. **No detection logic in `apps/`.**
- **Tiers:** `violation` deterministic; `likely`; `needs-review` with a yes/no `question`. AI never `violation`.
- **Generators:** engines via `nx g @clear-a11y/workspace-plugin:engine`, rules via `:rule`, fixtures via `:fixture`; other projects via official `@nx/*` generators. Run `pnpm nx sync` after adding deps.
- **Every rule ships** fixture + `-ok` page + expected entries + unit tests + integration test (`test-integration`) + doc in `docs/rules/<engine>/`.
- **Offline:** only localhost fixture servers; no real websites; the crawler test uses an external link only to prove it is _not_ followed.

### Pitfalls and hints

- This slice defines contracts that four parallel slices will build on. Get `PageContext`, `StateMeta`, the registry and the per-engine fresh-navigation rule right now; changing them later must be serial.
- axe `target` can contain iframe/shadow paths (arrays of arrays); join safely and record shadow hosts.
- Don't screenshot every axe node; cap crops (e.g. first 20 violations per page) to keep runs fast.
- Playwright `page.accessibility` is deprecated; don't build on it. Use CDP (`getCdpSession`) or `locator.ariaSnapshot()`.
- The CLI must stay ESM with a `#!/usr/bin/env node` shebang in the built entry; test the built binary, not just source.
- `clear-a11y` is unscoped on npm (AGENTS.md layout); keep the project name `cli`.
