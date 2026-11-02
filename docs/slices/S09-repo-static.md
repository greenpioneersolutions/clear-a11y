# S09: Repo static layer

## Goal

Create `@clear-a11y/repo` so Clear A11Y can scan a source repo: run accessibility lint rules (eslint-plugin-jsx-a11y, and the Vue/Angular equivalents when detected) with our own safe config, normalize the results into canonical Findings, and map runtime findings back to source file and line. Wire `clear-a11y scan <repo-path>`. Read the ground rules in "Notes" first.

## Wave

Wave 4, **parallel** with S08 and S10. S10 builds on this package; if run truly in parallel, S09 lands first in the merge order and S10 rebases.

## Projects

| Project              | Path              | Package              | Tags                                             | Status                                                                 |
| -------------------- | ----------------- | -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `@clear-a11y/repo`   | `packages/repo`   | `@clear-a11y/repo`   | `type:feature`, `scope:repo`, `publish:public`   | created (`@nx/js:library`)                                             |
| `@clear-a11y/runner` | `packages/runner` | `@clear-a11y/runner` | `type:feature`, `scope:runner`, `publish:public` | touched (`scanRepo`, `mapToSource` hook)                               |
| `cli`                | `apps/cli`        | `clear-a11y`         | `type:app`, `scope:cli`, `publish:public`        | touched (path detection)                                               |
| `bench`              | `tools/bench`     | `@clear-a11y/bench`  | `type:tool`, `scope:bench`, `publish:private`    | touched (include repo fixtures; matching lives in runner `benchmark/`) |

## Depends on

S01 (runner, CLI, Finding conventions from S00c: `page.url = "repo:<relative path>"`, `state: "source"`, `viewport: "none"`, required `source`).

## Scope

**Detection** `detectRepo(root)`: read `package.json` (and workspace package.jsons one level down) to find frameworks: React/Preact/Next (JSX/TSX), Vue (`vue`), Angular (`@angular/core`), Svelte (record "unsupported in static layer" for now). Find source globs (default `src/**`, `app/**`, `pages/**`, `components/**`; ignore `node_modules`, `dist`, `build`, `.next`, `coverage`).

**Static lint** `lintRepo(root, detection, config)` via the ESLint Node API:

- `new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [...ourConfig] })` — **never** load the repo's own `eslint.config.*` (it's executable code from an untrusted repo).
- React: `eslint-plugin-jsx-a11y` `strict` rules with `typescript-eslint` parser for TS/TSX. Vue: `eslint-plugin-vuejs-accessibility` + `vue-eslint-parser`. Angular: `@angular-eslint/template-plugin` accessibility rules with `@angular-eslint/template-parser` for `*.html` templates. All from the catalog.
- Only accessibility rules are enabled; parse errors become scan `errors`, not findings.

**Normalization** `toFinding(eslintMessage, ruleMap)`: `ruleId: repo/<plugin>/<rule>` (e.g. `repo/jsx-a11y/alt-text`), engine `repo-static`, `wcag` from a maintained map file `src/rule-map.ts` (e.g. `alt-text` → 1.1.1; `label-has-associated-control` → 1.3.1, 4.1.2; `click-events-have-key-events`/`no-static-element-interactions` → 2.1.1; `anchor-is-valid` → 2.1.1, 2.4.4; `aria-role`/`role-has-required-aria-props`/`aria-proptypes` → 4.1.2; `heading-has-content` → 1.3.1, 2.4.6; `html-has-lang` → 3.1.1; `no-autofocus` → 2.4.3 needs-review; `media-has-caption` → 1.2.2; `tabindex-no-positive` → 2.4.3; `no-noninteractive-element-to-interactive-role` → 4.1.2). Rules without a defensible SC mapping are not enabled.

- Tiers: static analysis can't see runtime props, so default `likely`; a curated subset becomes `violation` when the JSX has no spread props on the element (`alt-text` on `<img>`, `html-has-lang`, `aria-role` invalid literal role). `no-autofocus` and other context-dependent rules → `needs-review` with a question.
- `target.selector` = element description (`img`, `a[href="#"]`), `source { file (repo-relative, POSIX), line, column, component? (nearest enclosing function/class name if cheap) }`, `message` rewritten in plain language (not the raw lint text), `fix` from our rule doc.

**Runtime → source mapping** `mapFindingsToSource(page, findings, root)` (called by runner when scanning a running app from a repo, used by S10):

1. Attribute convention: nearest ancestor-or-self with `data-clear-a11y-src="src/App.tsx:12"` or common equivalents (`data-source-file`/`data-source-line`, `data-inspector-relative-path`/`data-inspector-line`). Document a tiny Babel/SWC plugin recipe that adds it in dev.
2. React dev builds: read fiber `_debugSource` (React ≤ 18) via `page.evaluate`; React 19 removed it — fall back to `_debugStack` parsing when available, else skip.
3. Otherwise leave `source` empty. Never guess.

**Runner/CLI**: `scanRepo({ root, config })` returns a `ScanResult` with static findings (S10 adds runtime). CLI `clear-a11y scan <target>`: if `<target>` is an existing directory → repo scan; if it parses as an `http(s)` URL → site scan; otherwise usage error.

**Benchmark**: expected-issue schema (runner-owned) gains optional `source: { file, line }`; repo findings match when the file is equal and line within ±2 and SC overlaps. Expected `page` for repo fixtures is `repos/<name>/<file>`.

## Out of scope

Running dev servers or Storybook (S10), Svelte static rules, autofix, CSS/`.scss` analysis, the repo's own lint config.

## Files to create/change

`packages/repo/src/{detect.ts,lint.ts,eslint-config.ts,rule-map.ts,to-finding.ts,source-map/{attributes.ts,react-fiber.ts,map-findings.ts},index.ts}` + tests, `packages/repo/test/*.integration.test.ts`; `packages/runner/src/{repo.ts,benchmark/match.ts,benchmark/expected-schema.ts}`; `apps/cli/src/commands/scan.ts`; `fixtures/repos/react-sample/**` (+ `vue-sample` minimal, optional), `fixtures/expected/repos/**`; `.nxignore` (`fixtures/repos/`); `docs/rules/repo/*.md` (one page per mapped rule family or a single table page); catalog entries.

## Tests

- Unit: framework detection on package.json snippets, rule-map completeness (every enabled rule maps to valid SCs from core's WCAG map), message normalization, tier logic with/without spread props, attribute parsing (`src/App.tsx:12` → file/line), path normalization on Windows-style paths, benchmark source matching (±2 lines).
- Integration: `lintRepo(fixtures/repos/react-sample)` finds each seeded issue at the right file/line; ensure the fixture contains an `eslint.config.js` that would `throw` if executed, proving we never load it; `mapFindingsToSource` on a fixture page with `data-clear-a11y-src` attributes.
- CLI: `clear-a11y scan fixtures/repos/react-sample --format json` exits 1 with `--fail-on likely`.

## Fixtures + expected findings

`fixtures/repos/react-sample/`: tiny React + TS source tree (not installed or built; no `node_modules`), `package.json` listing `react`, files `src/App.tsx`, `src/components/{ProductCard.tsx,SignupForm.tsx,IconButton.tsx}` seeded with: `<img>` without alt (1.1.1), clickable `div` (2.1.1), input without label (1.3.1, 4.1.2), `<a href="#">` (2.4.4), positive `tabIndex` (2.4.3), plus correct-pattern components (`ProductCardOk.tsx`, etc.) that must yield nothing. Expected file `fixtures/expected/repos/react-sample.json` with `source` per issue, `layer: "repo"`. Include `fixtures/site/repo-map/annotated.html` (runtime page with `data-clear-a11y-src` attributes and one seeded issue) → `annotated-ok.html`.

## Docs to update

`packages/repo/README.md` (what's scanned, safety model: never executes repo code in this layer), `docs/rules/repo/*.md`, CLI README (`scan <path>`), fixtures README (repo fixtures + `source` matching), `docs/DECISIONS.md` (override config, tier policy, attribute convention).

## Acceptance criteria

- [ ] `clear-a11y scan fixtures/repos/react-sample` reports every seeded issue with file and line and nothing from the `Ok` components.
- [ ] The repo's own ESLint config is never loaded (tested).
- [ ] Runtime findings get `source` when attributes are present; no guessed locations.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; repo `test-integration` passes; `pnpm nx sync:check` passes; Nx doesn't pick up `fixtures/repos/*` as projects (`nx show projects`).
- [ ] `pnpm nx run bench:run` includes repo-layer recall; overall precision of `violation` ≥ 0.95. Record the delta.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- `Finding` (core): `id, ruleId, wcag[], tier, confidence, engine, page{url,state,viewport}, target{selector,role?,name?}, evidence{...}, source?{file,line,column?,component?}, message, fix?, question?`. Repo findings use `page.url = "repo:<path>"`, `state: "source"`, `viewport: "none"`.
- **Tags/boundaries:** `repo` is `type:feature` (may use engine, data-access, util, feature); runner may import repo; the CLI (app) only parses input and calls runner/reporter. `publish:public` → public only (all lint plugins are third-party deps, fine). Test files may import `test-utils`.
- **No detection logic in `apps/`.** Engines never import engines.
- **Tiers:** `violation` only when deterministic and certain; static lint defaults to `likely`.
- **Untrusted repos:** treat repo content as data; never execute repo configs or scripts in this layer.
- **Offline:** the fixture repo has no dependencies installed; plugins come from our workspace.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`.

### Pitfalls and hints

- ESLint flat config `files` globs resolve relative to `cwd`; set `cwd` to the repo root and pass explicit file lists.
- `typescript-eslint` without `project` (no type info) is enough for a11y rules and avoids needing the repo's tsconfig.
- Exclude `fixtures/repos/**` from root ESLint, Prettier, tsconfig and Nx project inference (`.nxignore`).
