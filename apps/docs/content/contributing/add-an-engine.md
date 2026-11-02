---
title: Add an engine
description: Create a new engine package with the generator and register it in the runner.
---

An engine is a whole kind of expert check (keyboard, visual, the accessibility tree...). New engines are rare: most contributions are new [rules](/contributing/add-a-rule/) in an existing engine. Large new capabilities start as an RFC in `docs/rfcs/`, so the approach is agreed before code is written.

## 1. Generate the package

```sh
pnpm nx g @clear-a11y/workspace-plugin:engine <name> --description="What the engine detects, in one sentence."
```

This creates `@clear-a11y/engine-<name>` in `packages/engines/<name>` with the right tags (`type:engine`, `scope:<name>`, `publish:public`), TypeScript and Vitest setup, an engine skeleton, an empty rule list, a unit test, an integration test and a README. Never copy another engine's folder: the generator keeps tags, module boundaries and test setup correct.

## 2. Implement the contract

```ts
interface Engine {
  name: string; // "engine-<name>"
  mutatesPage?: boolean; // true if run() changes the page (the runner then gives it a fresh page)
  run(ctx: PageContext): Promise<Finding[]>;
}
```

The engine gets a live page that is already in the state to test. Keep analysis in pure functions and browser I/O in the engine. Validate your own options from `ctx.config.<name>` with Zod. Build every finding with `createFinding()` from `@clear-a11y/core`, which checks the schema (a `needs-review` finding needs a `question`).

An engine may depend only on `core` and `browser`. **Engines never import other engines.** If your engine needs another engine's output, the runner passes it along.

## 3. Register it in the runner

Add one line to the engine registry in `packages/runner/src/engines.ts` and its rules to `allRules()` in `packages/runner/src/rules.ts`. Then run `pnpm nx sync` so TypeScript project references are updated. Once its rules are in `allRules()`, they appear in reports and in this site's rules reference automatically.

## 4. Add rules and measure

Add rules with the rule generator, then run the benchmark:

```sh
pnpm nx g @clear-a11y/workspace-plugin:rule --engine=<name> --name=<rule> --wcag=<sc>
pnpm nx run bench:run
```

If `lint` reports a module-boundary violation, fix the architecture (move code into the right package or into the runner). Never loosen the rule or the tags.
