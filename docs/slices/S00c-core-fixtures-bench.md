# S00c: Core, test-utils, fixtures, bench

## Goal

Lay the measurement foundation: the canonical `Finding` schema and shared types in `@clear-a11y/core`, test helpers, the seeded-barrier fixture site with expected findings, the pure benchmark scoring module in `@clear-a11y/runner`, and the `bench` harness that writes `bench-results/latest.json` and `latest.md`. After this slice, `pnpm nx run bench:run` works (with zero findings until S01 wires a scan). Read the ground rules in "Notes" first.

## Wave

Wave 1, **serial** (after S00b). This is the last slice allowed to shape `packages/core` freely; later parallel slices may not change it.

## Projects

| Project                  | Path                  | Package                  | Tags                                             | Status                          |
| ------------------------ | --------------------- | ------------------------ | ------------------------------------------------ | ------------------------------- |
| `@clear-a11y/core`       | `packages/core`       | `@clear-a11y/core`       | `type:util`, `scope:shared`, `publish:public`    | created                         |
| `@clear-a11y/test-utils` | `packages/test-utils` | `@clear-a11y/test-utils` | `type:test`, `scope:shared`, `publish:private`   | created                         |
| `@clear-a11y/runner`     | `packages/runner`     | `@clear-a11y/runner`     | `type:feature`, `scope:runner`, `publish:public` | created (benchmark module only) |
| `fixtures`               | `fixtures`            | `@clear-a11y/fixtures`   | `type:test`, `scope:fixtures`, `publish:private` | created                         |
| `bench`                  | `tools/bench`         | `@clear-a11y/bench`      | `type:tool`, `scope:bench`, `publish:private`    | created                         |

## Depends on

S00a (workspace), S00b (fixture generator for seeding pages).

## Scope

**core** (create with `@nx/js:library`, no runtime deps except `zod`):

- `finding.ts`: Zod schema + inferred types. Shape from AGENTS.md: `id`, `ruleId`, `wcag: string[]` (non-empty, each `^\d\.\d{1,2}\.\d{1,2}$` and present in the WCAG map), `tier: 'violation'|'likely'|'needs-review'`, `confidence` 0..1, `engine`, `page {url, state, viewport}`, `target {selector, role?, name?}`, `evidence {screenshot?, focusPath?, axTree?, announcement?, html?}`, `source? {file, line, column?, component?}`, `message`, `fix?`, `question?`. `FocusStop = { index, selector, name?, rect: {x,y,width,height}, backward? }`. Refinement: `needs-review` requires `question`. `page.url` is a plain string so repo findings can use `repo:<relative path>` with `state: 'source'`, `viewport: 'none'` and a required `source`.
- `finding-id.ts`: `findingId({ruleId, selector, url, state, viewport})` → stable hex hash. Pure JS (e.g. FNV-1a 64 or a small SHA-256), **not** `node:crypto`, so core runs in browsers and Electron renderers.
- `tier-policy.ts`: `enforceTierPolicy(finding, deterministic: Finding[] = [])`: if `engine` starts with `ai-`, cap tier at `likely` unless a non-AI finding with the same `target.selector` (or containment) and an overlapping SC exists; never upgrades. `isAiEngine(name)`.
- `wcag.ts`: WCAG 2.2 SC map: the 86 active criteria plus 4.1.1 Parsing marked `obsolete: true` (excluded from validation): `{ sc, title, level: 'A'|'AA'|'AAA', principle, guideline, understanding: 'https://www.w3.org/WAI/WCAG22/Understanding/<slug>' }`; helpers `getSc`, `isValidSc`, `scsByLevel`.
- `rule-meta.ts`: `RuleMeta { id, title, engine, wcag, tier, description, docs }` (the rule generator from S00b imports this).
- `config.ts`: Zod `ClearA11yConfig` with defaults: `targets`, `maxPages` (20), `viewports` (`desktop` 1280×800, `mobile` 375×812), `engines` (enabled list), `failOn` (`violation`), `report { formats, outDir }`, `ai { provider: 'none'|'mock'|'anthropic'|'openai'|'bedrock'|'vertex'|'azure'|'ollama' (default `none`), model?, apiKeyEnv?, baseUrl?, maxCalls? }` with passthrough, and **loose per-area sections** `static`, `keyboard`, `states`, `visual`, `at`, `widgets`, `repo`, `personas` (arrays/records of `unknown`, passthrough). Each engine validates its own section with its own Zod schema, so later parallel slices never need to change core.
- `index.ts` re-exports. README.

**test-utils** (`@nx/js:library`, private): `startFixtureServer({ root, port = 0 })` → `{ url, close }` (node:http static server, correct MIME types, no directory listing, binds 127.0.0.1); `loadRecordedResponses(dir)` + `recordingKey(parts)` (generic JSON keyed by a stable hash; no import of `@clear-a11y/ai`); Vitest matchers `toContainFinding({ ruleId, selector?, tier? })`, `toHaveNoViolations()`; `makeFinding(partial)` factory.

**fixtures** (package.json-only project): `fixtures/site/**` HTML, `fixtures/expected/**/<page>.json` mirroring site paths, `fixtures/scripts/serve.mjs` (standalone `node:http`, no workspace imports, because a `type:test` project may not depend on another `type:test` project), `serve` target (`nx run fixtures:serve`, port 4400 by default, `continuous: true`). Expected schema: `{ page, title, correctPattern, issues: [{ id, wcag[], selector, layer, description, ruleId? }] }`; `layer` ∈ `static|keyboard|states|visual|at|widgets|ai|persona|repo`.

**runner** (`@nx/js:library`, only `src/benchmark/` for now):

- `expected-schema.ts` (Zod for the format above), `load-expected.ts`.
- `match.ts`: `matches(finding, issue, opts)` = same page (compare URL path relative to the fixture base, ignore query/hash) AND overlapping WCAG SC AND selector match (exact, or one string contains the other, or an optional `sameElement(a, b)` resolver returns true). Each expected issue is matched at most once; findings of any tier count for recall.
- `score.ts`: `scoreBenchmark(findings, expectedPages)` → `{ precisionViolation, recall, recallBySc, recallByLayer, foundByEngine, perPage, falsePositives, missed }`. Precision of `violation` = matched violations / all violations (a violation on a correct-pattern page or matching nothing is a false positive). Report `null` (not NaN) when there are no violations.
- `report.ts`: `toMarkdown(result, baseline?)` with delta columns computed on the intersection of pages present in both runs.
- `runBenchmark({ baseUrl, expectedDir, scan })` where `scan(urls) => Promise<Finding[]>` is injected.

**bench** (`tools/bench`, `run` target): starts the fixture server via test-utils, loads expected files, calls `runBenchmark` with a scan function (a no-op returning `[]` until S01 replaces it with `runner.scan`), writes `bench-results/latest.json` and `bench-results/latest.md`, compares with `bench-results/baseline.json` if present, prints a summary. Options: `--engines`, `--pages <glob>`. Exit non-zero only on errors, not on low scores (CI gates come later). Fixture-integrity test lives here.

**Seed fixtures** (use the fixture generator): roughly 10 barrier pages plus `-ok` counterparts across areas, modeled on common human-audit findings, so the S01 baseline shows what axe alone misses (see below).

## Out of scope

Scanning (S01), browser/PageContext types (S01), engines, HTML/SARIF reports, CI gates on benchmark thresholds.

## Files to create/change

`packages/core/**`, `packages/test-utils/**`, `packages/runner/{package.json,src/index.ts,src/benchmark/**}`, `fixtures/{package.json,site/**,expected/**,scripts/serve.mjs,README.md}`, `tools/bench/**`, `nx.json` (`bench:run` target default: inputs `fixtures/**`, `^production`; outputs `{workspaceRoot}/bench-results/latest.*`), `bench-results/.gitkeep`, `docs/DECISIONS.md`.

## Tests

- core: schema accepts a full valid finding, rejects unknown SC, missing `question` on needs-review, confidence out of range; `findingId` stable across runs and order-independent of object keys; `enforceTierPolicy` caps `ai-*` violation→likely, keeps confirmed ones, never upgrades, leaves non-AI untouched; WCAG map has 86 active entries (+ obsolete 4.1.1), every entry has level and URL; config defaults (`ai.provider === 'none'`).
- test-utils: fixture server serves files, 404s outside root (path traversal `/../`), random port works; matchers pass/fail messages.
- runner/benchmark: matching cases (exact, containment, SC mismatch, wrong page, double-match prevention), precision/recall arithmetic on hand-built data, `null` precision, delta on page intersection.
- bench: fixture integrity — every `fixtures/site/**/*.html` has an expected file and vice versa; every expected file validates; correct-pattern pages have no issues; every SC is valid.

## Fixtures + expected findings

Seed set (barrier → correct pattern), each with expected entries and `layer`:

- `fixtures/site/static/img-missing-alt.html` → `img-missing-alt-ok.html` (1.1.1, static)
- `fixtures/site/static/input-no-label.html` → `input-no-label-ok.html` (1.3.1, 4.1.2, static)
- `fixtures/site/keyboard/focus-order-backward.html` → `focus-order-backward-ok.html` (2.4.3: first name → country → last name)
- `fixtures/site/keyboard/focus-not-visible.html` → `focus-not-visible-ok.html` (2.4.7)
- `fixtures/site/keyboard/click-div-button.html` → `click-div-button-ok.html` (2.1.1)
- `fixtures/site/visual/reflow-fixed-width.html` → `reflow-fixed-width-ok.html` (1.4.10)
- `fixtures/site/visual/contrast-over-image.html` → `contrast-over-image-ok.html` (1.4.3)
- `fixtures/site/states/menu-hidden-link-no-name.html` → `-ok` (4.1.2 inside an opened menu)
- `fixtures/site/at/error-not-announced.html` → `-ok` (4.1.3, 3.3.1)
- `fixtures/site/widgets/tabs-no-arrow-keys.html` → `-ok` (2.1.1 / 4.1.2)

Later slices may refine these pages but must keep ids stable.

## Docs to update

`packages/core/README.md`, `packages/test-utils/README.md`, `fixtures/README.md` (how to add a fixture, schema, matching rule), `tools/bench/README.md` (metrics, matching, how to read deltas), `docs/DECISIONS.md` (hash choice, evidence `html` field and repo-finding convention as S00 refinements of the Finding shape per ADR 0001).

## Acceptance criteria

- [ ] `pnpm nx run-many -t lint typecheck test build` passes.
- [ ] `pnpm nx sync:check` passes.
- [ ] `pnpm nx run fixtures:serve` serves the site on localhost.
- [ ] `pnpm nx run bench:run` writes `bench-results/latest.json` and `latest.md` (recall 0, precision `null` until S01). Record that in `docs/PROGRESS.md`.
- [ ] `pnpm nx release --dry-run` succeeds with `core` and `runner` in the fixed group.
- [ ] `core` has no dependency on Playwright, any AI SDK or `node:*` modules.
- [ ] `runner` does not import `fixtures` or `bench` (it reads files via paths passed in).

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract** (ADR 0001): `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`, with `PageContext`/`Engine` in `@clear-a11y/browser` (S01). Core owns `Finding`, `RuleMeta`, WCAG map, config, `findingId`, `enforceTierPolicy`. The Finding schema is a public API: after this slice, changes need an ADR.
- **Tags/boundaries:** app → feature, engine, data-access, util · feature → feature, engine, data-access, util · engine → data-access, util · data-access → util · util → util · test → data-access, util · tool → anything except app. `publish:public` depends only on `publish:public`. Test files may also import `type:test` (`test-utils`, devDependency only).
- **Engines never import engines**; coordination in `runner`. No detection logic in `apps/`.
- **Tiers:** `violation` deterministic; `likely`; `needs-review` with `question`. AI never `violation`.
- **Generators:** fixtures via `nx g @clear-a11y/workspace-plugin:fixture`; libraries via `@nx/js:library`. Run `pnpm nx sync` after adding deps.
- **Offline:** localhost only, no network in tests.

### Pitfalls and hints

- Zod 4 is in the catalog; use its API (`z.object`, `.refine`, `z.infer`) and export both schemas and types.
- The WCAG titles and Understanding URLs are W3C content; S00d adds the W3C attribution to `NOTICE`. Type the map by hand from the WCAG 2.2 Recommendation; don't fetch it.
- Make fixture pages clean apart from the seeded barrier, or every unrelated finding becomes a false positive.
- Keep scoring pure (no fs, no browser) so the CLI can reuse it; file loading sits in thin wrappers.
- Exclude `bench-results/latest.*` from Prettier; commit `latest.*` and `baseline.json` so deltas show up in PRs.
