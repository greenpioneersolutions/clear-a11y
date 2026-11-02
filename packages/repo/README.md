# @clear-a11y/repo

Source-repo scanning for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y): detects how a repo is built, lints its source with accessibility rules under a fixed, safe configuration, turns the results into canonical findings with file and line, maps runtime findings back to source, and provides the browser-free building blocks of the runtime layer (Storybook story index, dev-server planning and process management).

```sh
npm install @clear-a11y/repo
```

```ts
import { scanRepo } from '@clear-a11y/repo';

const { result, detection, notices } = await scanRepo({ path: './my-app' });
console.log(detection.frameworks, result.summary);
for (const f of result.findings)
  console.log(f.tier, f.ruleId, `${f.source?.file}:${f.source?.line}`);
```

`result` is a normal `ScanResult`, so every `@clear-a11y/reporter` format works unchanged (SARIF gets physical file locations). This `scanRepo` is the **static layer only**. For static + runtime (every Storybook story, or the dev server with `boot`), use `scanRepo` from `@clear-a11y/runner`, which is what `clear-a11y scan <path>` runs:

```ts
import { scanRepo } from '@clear-a11y/runner';

const { result, runtime } = await scanRepo({ path: './my-app', repo: { maxStories: 100 } });
console.log(runtime.mode, runtime.stories); // "storybook", 42
```

## What it scans

- **React, Preact, Next.js, CRA** (`.jsx`, `.tsx`, `.js`): `eslint-plugin-jsx-a11y` recommended rules, parsed with typescript-eslint's parser (no type information, no repo tsconfig).
- **Vue, Nuxt** (`.vue`): `eslint-plugin-vuejs-accessibility` recommended rules with `vue-eslint-parser`.
- **Angular** (`.html` templates): `@angular-eslint/eslint-plugin-template` accessibility rules, loaded from the repo's own `node_modules` only with `repo.trustRepoPlugins: true` (it runs repo code). Otherwise the report notes that templates were not linted.
- **Svelte**: detected and reported as not covered yet.

Only rules with a defensible WCAG mapping are enabled. Findings are `likely` by default (lint can't see runtime props), `violation` only when the source is unambiguous (for example a literal `<img>` with no alt and no spread props), and `needs-review` with a question for context-dependent rules such as autofocus. The full mapping and reasoning: [docs/repo-scanning.md](../../docs/repo-scanning.md).

## Runtime modes

| Mode            | Trigger                                                 | Repo code that runs                                               |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Built Storybook | `storybook-static/` detected, or `repo.storybookStatic` | the built Storybook's JavaScript, inside the browser sandbox only |
| Local Storybook | `repo.storybookUrl` (`--storybook-url`), localhost only | none started by Clear A11Y                                        |
| Dev server      | `repo.boot: true` (`--boot`), **opt-in**                | the repo's dev script, as a child process on this machine         |
| None            | default without Storybook                               | none; the result explains how to enable runtime scanning          |

Clear A11Y never installs dependencies, never runs `storybook build` and never runs scripts other than the one dev script with `boot`. With `boot`, a missing `node_modules` stops the runtime layer with a clear message, the server binds to `127.0.0.1`, and its whole process tree is killed after the scan, on errors and timeouts, and when Clear A11Y exits or is interrupted.

## Safety model

The static layer never runs code or configuration from the scanned repo. Files are read as text and linted in memory with ESLint's `Linter` and a config built in code: the repo's `eslint.config.*`, `.eslintrc*`, tsconfig and inline `eslint-disable` comments are ignored, symbolic links are not followed, and scripts are never run. The opt-in exceptions are `trustRepoPlugins` (Angular lint plugin) and `boot` (dev server); see the table above.

## Runtime → source mapping

```ts
import { mapFindingsToSource, sourceAttributesProbe } from '@clear-a11y/repo';

const mapped = await mapFindingsToSource(runtimeFindings, './my-app', {
  // Optional facts from the live page, e.g. via Playwright:
  hints: async (f) => ({
    attributes: await page.locator(f.target.selector).evaluate(sourceAttributesProbe),
  }),
});
```

Strategies: the `data-clear-a11y-src="src/Card.tsx:12"` attribute convention (also `data-source-file`/`data-source-line` and react-dev-inspector's attributes), React dev-build debug info, then a literal search for unique ids, test ids, classes and text with a confidence score. `source` is only set at confidence 0.8 or higher; we never guess. Story findings without a match fall back to the story's own file and export line.

## API

| Export                                                        | Purpose                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `scanRepo(options)`                                           | Static layer: detect + lint + normalize into `{ result, detection, notices }`.  |
| `detectRepo(path)` / `detectFromInput()`                      | Package manager, frameworks, Storybook, TypeScript, source folders, linters.    |
| `listSourceFiles(root, dirs, options)`                        | Safe file walk (skips build output, tests, stories, symlinks, large files).     |
| `lintRepo()` / `lintSource()`                                 | The lint layer, on disk or in memory.                                           |
| `toFindings()` / `RULE_MAP`                                   | Normalization and the WCAG/tier map.                                            |
| `mapFindingsToSource()`                                       | Runtime → source mapping.                                                       |
| `sourceAttributesProbe`, `reactDebugSourceProbe`              | Page-side helpers for Playwright's `evaluate`.                                  |
| `chooseRuntime(detection, config)`                            | Which runtime layer applies (Storybook URL, built Storybook, dev server, none). |
| `parseStoryIndex()`, `selectStories()`, `storyIframeUrl()`    | Storybook `index.json` (v3 to v5), filtering and caps, preview iframe URLs.     |
| `readStaticStoryIndex()`, `fetchStoryIndex()`, `isLocalUrl()` | Load the index from `storybook-static/` or a localhost Storybook.               |
| `detectFramework()`, `buildDevCommand()`                      | Dev-server framework and the `<pm> run <script>` command with port and env.     |
| `planDevServer()`, `startDevServer()`                         | Plan (reads package.json, checks `node_modules`) and start with readiness wait. |
| `spawnManaged()`, `killTree()`, `waitForReady()`              | Child process in its own group, tree kill, readiness polling.                   |

Docs: [Repo scanning](../../docs/repo-scanning.md).

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (repo scanning guide, lint rule reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/repo
