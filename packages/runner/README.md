# @clear-a11y/runner

Orchestration for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y): crawler -> states -> engines -> findings. Apps (CLI, MCP, Action, server, desktop) call this package; they hold no detection logic.

## Install

```sh
npm install @clear-a11y/runner
npx playwright install chromium   # the browser it drives
```

## Usage

```ts
import { scan } from '@clear-a11y/runner';

const result = await scan({ targets: ['http://localhost:3000/'], outDir: '.clear-a11y' });
console.log(result.summary);
```

Pipeline per URL and viewport: load the page, discover states (menus, dialogs, error states), then for each state run read-only engines on a shared load and give every page-mutating engine a fresh load of the same state. Findings are deduplicated by stable id and the tier policy is applied (AI findings are never `violation` on their own).

Long-running callers (the API server, the desktop app) can pass `onProgress({ done, total, url })`, called before each page and once at the end, and an `AbortSignal` as `signal`: the scan stops before the next page and rejects.

## State pipeline

1. **Discover.** When the `states` engine is enabled (`config.engines.states`, default on; `only` must include `states` if given), the default discoverer `exploreStates` runs `discoverStates` from `@clear-a11y/engine-states` once per URL and viewport, on its own page load so the default state stays untouched. Pass `discoverStates` to plug in another discoverer, or `states: false` to scan the default state only.
2. **Replay.** For each discovered state and each engine, the runner loads the URL fresh, calls `stateMeta.replay(page)` and then the state's `verify(page)`. A state that fails to replay or verify is skipped and recorded in `errors` (`could not replay state: ...`).
3. **Analyze.** Engines get `ctx.state` (e.g. `menu:open#site-menu`) and `ctx.stateMeta` (`kind`, `triggerSelector`, `replay`). Read-only engines share one replayed load per state; mutating engines each get their own. `engine-states` itself runs only in the default state.
4. **Dedupe.** A finding from a replayed state is dropped when the default state of the same page and viewport already has a finding with the same rule and selector (`dropStateDuplicates`), so a barrier visible everywhere is reported once.

Cost grows with states x engines x viewports; `config.states.maxStates` (default 10) caps states per page and viewport.

## Repo scans

`scanRepo({ path, config, repo })` scans a source repo: static lint from `@clear-a11y/repo`, then the runtime layer. With a built Storybook (or `repo.storybookUrl` on localhost) every story's `iframe.html?id=<id>&viewMode=story` goes through the same pipeline (the scanner waits for `#storybook-root` to render via the `prepare` hook); with `repo.boot: true` the dev server is started, crawled same-origin and always stopped. Runtime findings are mapped to source (attributes and React debug info read from the live page, then literal search, then the story file) and merged with the static ones into one `ScanResult`. `result.runtime` says what ran. See [docs/repo-scanning.md](../../docs/repo-scanning.md).

```ts
import { scanRepo } from '@clear-a11y/runner';

const { result, runtime } = await scanRepo({ path: './my-app' });
console.log(runtime.mode, runtime.stories, result.summary);
```

## Benchmark

Also contains the benchmark scoring used by `clear-a11y bench` and `pnpm nx run bench:run`: `runFixtureBenchmark`, `scoreBenchmark`, `benchmarkToMarkdown`, plus the repo layer (`runRepoBenchmark`, `scoreRepoBenchmark`, `repoBenchmarkToMarkdown`), which runs `scanRepo` on `fixtures/repos/*` (never booting a dev server) and matches source issues by file, line (±2) and WCAG SC, and Storybook story issues by story id, selector and WCAG SC.

The engine registry lives in `src/engines.ts`: one line per engine.

## Keyboard walk

`keyboardWalk(url, { viewport?, maxStops?, timeoutMs?, session? })` loads a page and presses Tab through it with engine-keyboard's walker, returning every stop (`selector`, `role`, `name`, `rect`, `backward`), the `backwardJumps`, how the walk ended (`wrapped`, `cycle`, `max`, `frame`) and the `cycle` members. It describes the focus path without creating findings; the MCP server's `keyboard_walk` tool uses it so apps never touch engine internals.

## Persona agents

When `config.personas.tasks` is non-empty, the registry adds the `persona` engine from `@clear-a11y/ai` (registry key `personas`, so `only: ['personas']` runs it alone). It mutates the page, runs only in the default state, and runs each task whose `match` fits the URL on a fresh load. Blocked tasks become `persona/task-blocked` findings from `persona-keyboard-only` / `persona-screen-reader`, which the tier policy treats as AI-tier (never `violation`). The AI planner gets a provider only when `ai.provider` is set. See [`docs/personas.md`](../../docs/personas.md).

`runFixtureBenchmark({ personas })` passes persona tasks to the scan; `bench:run` loads `fixtures/personas.json`.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (architecture, configuration reference, rules)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/runner
