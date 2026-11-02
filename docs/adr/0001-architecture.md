# ADR 0001: Architecture

- Status: Accepted
- Date: 2026-10-31

## Context

Clear A11Y aims to find 80%+ of what a human accessibility audit finds, on live sites and in source repos. Rules scanners (axe-core) find a fraction of real issues because many barriers only show up through behavior: keyboard focus movement, opened states, reflow, announcements. We need an architecture that:

- separates deterministic measurement from AI judgment,
- lets independent engines grow in parallel without coupling,
- gives every finding evidence and a trust tier,
- stays open, self-hostable and offline-testable.

## Decision

### 1. Nx monorepo with strict layers

`apps/` are thin shells. `packages/` hold all logic. Every project carries three tags in its `package.json` `nx` block:

- `type:*`: `app`, `feature`, `engine`, `data-access`, `util`, `test`, `tool`
- `scope:*`: the area (`scope:cli`, `scope:keyboard`, `scope:shared`, ...)
- `publish:*`: `public` or `private`

`@nx/enforce-module-boundaries` enforces this table and fails `lint`:

| Tag                | May depend on                      |
| ------------------ | ---------------------------------- |
| `type:app`         | feature, engine, data-access, util |
| `type:feature`     | feature, engine, data-access, util |
| `type:engine`      | data-access, util                  |
| `type:data-access` | util                               |
| `type:util`        | util                               |
| `type:test`        | data-access, util                  |
| `type:tool`        | anything except app                |

Plus `publish:public` may only depend on `publish:public`.

**Test files** (`*.test.ts`, `*.spec.ts`, `test/**`, `e2e/**`, `vitest*.config.ts`) may additionally import `type:test` projects (`test-utils`). This is configured as a second, file-scoped rule entry in the ESLint flat config, so production code still can't import test helpers. `test-utils` is always a `devDependency`.

**Engines never import other engines.** Cross-engine coordination (states feeding the keyboard walker, for example) happens in `runner`. `nx graph` must stay acyclic.

### 2. Project names

- Libraries in `packages/` use their package name as the Nx project name: `@clear-a11y/engine-keyboard` lives in `packages/engines/keyboard`.
- Apps, tools and the fixtures project use short project names so commands read well: `cli`, `mcp`, `action`, `server`, `desktop`, `docs`, `bench`, `fixtures`, `workspace-plugin`. Their package names are `clear-a11y` (CLI), `@clear-a11y/mcp`, `@clear-a11y/action`, `@clear-a11y/server`, `@clear-a11y/desktop`, `@clear-a11y/docs`, `@clear-a11y/bench`, `@clear-a11y/fixtures`, `@clear-a11y/workspace-plugin`.

### 3. Engine contract

```ts
// @clear-a11y/browser
interface PageContext {
  page: import('playwright').Page; // live page, already in the target state
  url: string;
  state: string; // "default", "menu:open#nav", "form:invalid#signup"
  viewport: { name: string; width: number; height: number };
  config: ClearA11yConfig; // from @clear-a11y/core
  artifacts: ArtifactSink; // writes screenshot crops, returns a relative path
  log: Logger;
}

interface Engine {
  name: string; // "engine-keyboard"
  run(ctx: PageContext): Promise<Finding[]>;
}
```

`core` must have zero runtime dependencies on Playwright or any AI SDK, so `PageContext` and `Engine` live in `@clear-a11y/browser` (data-access), which every engine may depend on. `core` owns the `Finding` schema, the WCAG map, the config schema and pure helpers (finding id hashing, tier rules).

Engines don't know about reporters, queues or apps. The `runner` builds the pipeline:

```
crawler (URLs) -> browser (session per viewport) -> engine-states (discover states)
   -> for each state: static, keyboard, visual, at, widgets
   -> optional ai judges (candidates from deterministic engines)
   -> dedupe + tier policy -> Finding[] -> reporter (JSON canonical, SARIF, HTML)
```

`engine-states` exposes state _descriptors_ with a replay function (`open(page)`); the runner replays a state and then hands the page to the other engines. No engine imports `engine-states`.

### 4. Finding tiers and trust

- `violation`: deterministic and high certainty. May fail CI.
- `likely`: strong signal, small chance of a false positive. Most AI findings.
- `needs-review`: a human decides. Carries a yes/no `question`.

AI findings are never `violation`. `core` exports `enforceTierPolicy(finding)` which downgrades any finding from an AI engine (`engine` starting with `ai-`) to at most `likely`, unless a deterministic engine produced a matching confirmation. The runner applies it to every finding before reporting.

Every finding carries WCAG SC, selector, page/state/viewport, evidence, engine, confidence and, when available, source location. The canonical output is the JSON finding list; SARIF and HTML derive from it.

### 5. Benchmark

"Measure everything" is part of the architecture, not a tool bolted on.

- `fixtures/site/` holds seeded-barrier pages and correct-pattern pages.
- `fixtures/expected/*.json` lists, per page, what a human auditor would log (WCAG SC, selector, the layer we expect to catch it).
- Scoring (matching findings to expected issues, precision, recall by SC and by engine layer) lives in `@clear-a11y/runner` under `benchmark/`, so the CLI's `clear-a11y bench` can use it without an app depending on a tool.
- `tools/bench` (project `bench`) is the workspace harness: it serves `fixtures/`, runs the scoring and writes `bench-results/latest.json` and `.md`.

Recall counts a finding of any tier. Precision is measured for `violation` findings and must stay at or above 0.95.

### 6. Bring your own model

AI providers are pluggable adapters in `@clear-a11y/ai`: `none` (default), `mock` (tests), Anthropic API key, OpenAI API key, Bedrock, Vertex, Azure OpenAI, Ollama. We do not build features that authenticate with a consumer chat subscription login (for example claude.ai login via a CLI). People who want "no API key" use our MCP server from their own agent instead. Screenshots and DOM are never sent to a remote model unless the user configured that provider.

Page and repo content is untrusted data. AI judge prompts wrap it in delimited data blocks and a prompt-injection fixture proves page text can't steer a verdict.

## Consequences

- Engines can be built in parallel worktrees with no merge conflicts beyond shared registration in `runner`.
- `browser` becomes a hub every engine depends on; changes to `PageContext` touch every engine and must be serial.
- `core` stays small and stable; the Finding schema is a public API and changes need an ADR.
- Benchmark scoring ships in a public package, which keeps `clear-a11y bench` usable by anyone with their own fixtures.

## Alternatives considered

- **`PageContext` in `core` with an opaque `page: unknown`**: keeps one contract package but forces casts in every engine. Rejected.
- **A separate `engine-api` package**: adds a project for two interfaces. Rejected for now; easy to extract later.
- **Benchmark scoring only in `tools/bench`**: the CLI could not offer `bench` without an app-to-tool dependency, which the boundary table forbids.
- **Letting engines call each other** (states calling keyboard): simpler at first, but it couples release cycles and creates cycles. Rejected.

## Amendment 1 (2026-10-31, S01)

Contracts refined while building the first scan, before the parallel engine slices:

- `PageContext` gains optional `stateMeta: { kind; triggerSelector?; replay?(page) }` so engines can re-open a state (focus return, announcements) without importing `engine-states`.
- `Engine` gains optional `mutatesPage` (default true). The runner runs read-only engines on one shared page load per state and gives every mutating engine a fresh load of that state.
- `selectorFor(handle)` in `@clear-a11y/browser` is the one shared stable-selector helper, so findings from different engines line up for dedupe and benchmark matching.
- The canonical JSON report is `ScanResult` in `@clear-a11y/core` (`schemaVersion: 1`).
- The Finding schema adds `evidence.html` and `evidence.data` (free-form measurements) and requires `question` on `needs-review` findings.
- Config has loose per-engine sections (`config.keyboard`, `config.visual`, ...) that each engine validates with its own schema.
