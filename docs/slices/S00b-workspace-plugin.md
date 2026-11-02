# S00b: Workspace plugin

## Goal

Create the local Nx plugin `@clear-a11y/workspace-plugin` with three generators (`engine`, `rule`, `fixture`) so every engine, rule and fixture is born with the right tags, exports, test setup, fixtures, expected findings and doc stub. After this slice, nobody copies folders by hand. Read the ground rules in "Notes" first.

## Wave

Wave 1, **serial** (after S00a, before S00c).

## Projects

| Project            | Path                     | Package                        | Tags                                            | Status  |
| ------------------ | ------------------------ | ------------------------------ | ----------------------------------------------- | ------- |
| `workspace-plugin` | `tools/workspace-plugin` | `@clear-a11y/workspace-plugin` | `type:tool`, `scope:tooling`, `publish:private` | created |

## Depends on

S00a (Nx workspace, plugins, ESLint boundaries, catalog).

## Scope

Create the project with the official `@nx/plugin:plugin` generator (then `@nx/plugin:generator` for each generator). Add it to the root `package.json` devDependencies as `workspace:*` so `nx g @clear-a11y/workspace-plugin:<name>` resolves.

**`engine` generator** — `nx g @clear-a11y/workspace-plugin:engine <name> [--description]`

- Creates `packages/engines/<name>/` with `package.json` (`name: @clear-a11y/engine-<name>`, `type: module`, exports map with the `@clear-a11y/source` condition, `nx.tags: ["type:engine", "scope:<name>", "publish:public"]`, deps `@clear-a11y/core` and `@clear-a11y/browser` as `workspace:*`, `publishConfig.access: public`, `files: ["dist", "README.md"]`).
- `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `eslint.config.mjs`, `vitest.config.mts` (unit: `src/**/*.test.ts`, `resolve.conditions` incl. `@clear-a11y/source`), `vitest.integration.config.mts` (`test/**/*.integration.test.ts`, longer timeout, single fork).
- `src/index.ts`, `src/lib/engine.ts` exporting `ENGINE_NAME = 'engine-<name>'` and `create<Class>Engine(): Engine` whose `run(ctx: PageContext): Promise<Finding[]>` returns `[]`; `src/rules/index.ts` exporting `export const rules: RuleMeta[] = [];`; `src/lib/engine.test.ts`; `test/engine.integration.test.ts` (starts a fixture server, opens a page with Playwright, runs the engine); `README.md` (purpose, install, minimal example, docs link).
- `docs/rules/<name>/` directory (with `.gitkeep` or an index stub).
- `nx.targets["test-integration"]` only if the target default from S00a doesn't already apply.
- Fails clearly if the engine already exists. Prints a reminder to run `pnpm nx sync` and to register the engine in `packages/runner/src/engines.ts`.

**`rule` generator** — `nx g @clear-a11y/workspace-plugin:rule <name> --engine=<engine> --wcag=2.4.3[,2.4.7] [--tier=violation|likely|needs-review] [--title]`

- Rule id `<engine>/<name>` (e.g. `keyboard/focus-order-backward`).
- `packages/engines/<engine>/src/rules/<name>.ts`: exports `<prop>Rule: RuleMeta` (`id`, `title`, `wcag`, `tier`, `engine`, `description`, `docs: 'docs/rules/<engine>/<name>.md'`) and a pure `check` function stub.
- `src/rules/<name>.test.ts` (unit test of the pure function).
- Registers the rule in `src/rules/index.ts` (`rules` array + import), idempotent and failing loudly if the array marker is missing.
- Barrier fixture `fixtures/site/<engine>/<name>.html` and correct-pattern fixture `fixtures/site/<engine>/<name>-ok.html` (via the fixture generator's write function).
- Expected entries `fixtures/expected/<engine>/<name>.json` (one TODO issue with `wcag`, `layer: <engine>`, `ruleId`) and `fixtures/expected/<engine>/<name>-ok.json` (`correctPattern: true`, `issues: []`).
- Rule doc stub `docs/rules/<engine>/<name>.md` with frontmatter (`id`, `title`, `engine`, `wcag`, `tier`) and sections: What it catches, Who it affects, WCAG, How to fix, Examples (failing / passing), How we detect it, Known limitations. `docs/rules/` is the source of truth until the docs site (S15) consumes it.

**`fixture` generator** — `nx g @clear-a11y/workspace-plugin:fixture <area>/<page> [--wcag] [--layer] [--rule-id] [--correct-pattern] [--description]`

- `fixtures/site/<area>/<page>.html`: valid, minimal, otherwise-accessible HTML5 page (`lang`, `<title>`, `<main>`, one `<h1>`), with a comment block stating the seeded barrier.
- `fixtures/expected/<area>/<page>.json` following the schema `{ page, title, correctPattern, issues: [{ id, wcag[], selector, layer, description, ruleId? }] }` where `page` is the path relative to `fixtures/site` and `id` is `<area>/<page>#<n>`.

## Out of scope

Generators for apps or non-engine libraries (use official `@nx/*` generators), the runner registry file itself (S01), Zod validation of expected files (S00c), docs site integration (S15).

## Files to create/change

- `tools/workspace-plugin/**` (package.json, `generators.json`, `src/index.ts`, `src/utils/names.ts`, `src/generators/{engine,rule,fixture}/{<name>.ts,<name>.spec.ts,schema.json,schema.d.ts,files/**}`)
- Root `package.json` (devDependency `@clear-a11y/workspace-plugin: workspace:*`), `tsconfig.json` references (via `nx sync`)
- `docs/DECISIONS.md` (module format decision, see Notes)

## Tests

Unit tests (Vitest) with `createTreeWithEmptyWorkspace()` from `@nx/devkit/testing`:

- `engine`: files exist; `package.json` name, tags and exports condition correct; generated `engine.ts` contains `engine-<name>`; re-running throws.
- `rule`: throws when the engine is missing; creates rule, test, both fixtures, both expected files, doc stub; registers in `rules/index.ts` exactly once; parses `--wcag` (`"2.4.3, 2.4.7"` → `["2.4.3","2.4.7"]`) and rejects invalid SC strings; default tier `violation`.
- `fixture`: correct-pattern pages get `issues: []`; ids follow `<area>/<page>#1`; nested areas work; refuses to overwrite.
- `names` util: kebab/class/property variants.
- Snapshot the generated `package.json` of an engine to catch accidental drift.

## Fixtures + expected findings

The generators produce fixtures; this slice commits none. Example output for `rule focus-order-backward --engine=keyboard --wcag=2.4.3`:

- `fixtures/site/keyboard/focus-order-backward.html` and `fixtures/site/keyboard/focus-order-backward-ok.html`
- `fixtures/expected/keyboard/focus-order-backward.json` and `fixtures/expected/keyboard/focus-order-backward-ok.json`

## Docs to update

- `tools/workspace-plugin/README.md`: each generator, its options and an example.
- `docs/DECISIONS.md`: plugin module format; rule docs location (`docs/rules/<engine>/<rule>.md`).
- `AGENTS.md` Commands already lists `nx g @clear-a11y/workspace-plugin:rule <name>`; correct the flags if they differ.

## Acceptance criteria

- [ ] `pnpm nx g @clear-a11y/workspace-plugin:engine demo --dry-run` lists the expected files (then nothing is written).
- [ ] `pnpm nx g @clear-a11y/workspace-plugin:rule demo-rule --engine=demo --wcag=1.1.1 --dry-run` works after a real `engine demo` run in a scratch branch; delete the scratch engine before committing.
- [ ] `pnpm nx test workspace-plugin` passes; every generator has tests.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes.
- [ ] `pnpm nx sync:check` passes.
- [ ] `pnpm nx run bench:run` delta: not applicable (bench arrives in S00c).

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract** (ADR 0001): `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`. `PageContext`/`Engine` live in `@clear-a11y/browser` (created in S01). `Finding` and `RuleMeta` live in `@clear-a11y/core` (created in S00c). Templates import these types even though the packages don't exist yet; that's fine because generator tests run on a virtual tree. S00c must export `RuleMeta` with the fields above.
- **Tags/boundaries:** app → feature, engine, data-access, util · feature → feature, engine, data-access, util · engine → data-access, util · data-access → util · util → util · test → data-access, util · tool → anything except app. `publish:public` depends only on `publish:public`. Test files may also import `type:test`.
- **Engines never import other engines**; coordination in `@clear-a11y/runner`. No detection logic in `apps/`.
- **Tiers:** `violation` (deterministic), `likely`, `needs-review` (with a yes/no `question`). AI never produces `violation`.
- **Offline**: generator tests never touch disk or network.

### Pitfalls and hints

- Nx loads local plugins through its own transpiler, which is most reliable with CommonJS. Making this one package `"type": "commonjs"` with a `build` (`@nx/js:tsc`) that copies `files/**` templates into `dist`, and pointing `generators.json` at `./dist/...`, is a safe choice. Record it in `docs/DECISIONS.md`. If you do that, `nx g` needs the plugin built first; document `pnpm nx build workspace-plugin` in its README (or make generators resolve from source and prove it works).
- Template files must not be picked up by `tsc` or ESLint: use the `.template` suffix and exclude `files/**` from `tsconfig.lib.json`.
- Use `generateFiles` + `formatFiles`; use `names()` from `@nx/devkit` for casing.
- The generated engine's `vitest.config.mts` must include `resolve: { conditions: ['@clear-a11y/source', ...] }`, or tests will import `dist/`.
- Generated pages must be accessible except for the one seeded barrier; otherwise later benchmarks count unrelated false positives.
- Keep templates small. The generated engine is a stub, not a framework.
