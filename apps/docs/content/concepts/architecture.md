---
title: Architecture
description: How Clear A11Y is built - the Nx workspace, the engines, the runner pipeline, the Finding schema and tiers.
---

This page is for people who want to understand how Clear A11Y works inside, or contribute to it. The decisions behind it are recorded in [ADR 0001: Architecture](/architecture/adr/0001-architecture/) and [ADR 0002: Nx workspace](/architecture/adr/0002-nx-workspace/).

## Principles

1. **Deterministic first, AI second.** Anything that can be measured (where focus goes, the pixels behind text, whether content overflows, what the accessibility tree says) is measured in code, in a real browser. AI only answers judgment calls: meaning, context and intent.
2. **Protect trust.** Every finding has a tier, and an AI never produces a `violation` on its own.
3. **Evidence or it didn't happen.** Every finding carries proof.
4. **Measure everything.** Every detection change adds seeded barriers to the fixtures and runs the [benchmark](/concepts/coverage/).
5. **Open and self-hostable.** No required SaaS, account, cloud cache or secret. A fresh fork builds, tests and benchmarks offline.
6. **Bring your own model.** AI providers are pluggable, and consumer chat-subscription logins are never used.
7. **Practice what we test.** Everything with a UI, including this site, must pass Clear A11Y with zero `violation`s.

## The workspace

Clear A11Y is an [Nx](https://nx.dev) monorepo with pnpm workspaces and TypeScript project references.

```text
apps/        Thin shells, no detection logic
  cli/         clear-a11y command line
  mcp/         MCP server and SKILL.md for coding agents
  action/      GitHub Action
  server/      Self-hosted API and workers
  desktop/     Desktop app
  docs/        This site
packages/    All real logic
  core/        Finding schema, WCAG map, config, tiers (no browser or AI dependencies)
  browser/     Playwright sessions, viewports, page helpers
  engines/     static, keyboard, states, visual, at, widgets
  ai/          AI provider adapters, judges, persona agents
  crawler/     URL discovery
  runner/      The pipeline: crawler -> states -> engines -> findings; benchmark scoring
  repo/        Source lint, Storybook and dev-server scanning, source mapping
  reporter/    JSON, SARIF, HTML and text output
  queue/       Job queues for the server
fixtures/    Seeded-barrier pages, sample repos, expected findings
tools/       Benchmark harness and Nx generators
```

Every project has a `type:*` tag, and ESLint enforces which types may depend on which:

| Type          | Projects                        | May depend on                      |
| ------------- | ------------------------------- | ---------------------------------- |
| `app`         | apps/\*                         | feature, engine, data-access, util |
| `feature`     | runner, crawler, repo, reporter | feature, engine, data-access, util |
| `engine`      | engines/\*, ai                  | data-access, util                  |
| `data-access` | browser, queue                  | util                               |
| `util`        | core                            | util                               |
| `test`        | test-utils, fixtures            | data-access, util                  |
| `tool`        | tools/\*                        | anything except app                |

Two rules matter most: **engines never import other engines** (the runner coordinates them), and **apps never import other apps**. This site, for example, reads the CLI's options from a JSON file the CLI writes about itself, instead of importing the CLI.

## Engines

An engine is one kind of expert check. Each implements the same small interface:

```ts
interface Engine {
  name: string; // "engine-keyboard"
  run(ctx: PageContext): Promise<Finding[]>;
}
```

`PageContext` gives the engine a live Playwright page that is already in the state to test, plus the URL, state name, viewport, config, a place to save screenshot crops, and a logger. It also offers an optional `recordPass` callback: an engine that measured an element and found it compliant (for example real-pixel contrast on a gradient) records a verified pass ([ADR 0003](/architecture/adr/0003-engine-pass-records/)). Engines know nothing about reports, queues or apps.

| Engine            | What it does                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `engine-static`   | Runs axe-core rules tagged with a WCAG A or AA success criterion.                                             |
| `engine-states`   | Opens menus, dialogs, accordions, tabs, tooltips and form error states, and describes how to replay each one. |
| `engine-keyboard` | Presses Tab for real: focus order against visual order, focus visible, traps, focus return, skip links.       |
| `engine-visual`   | Reflow at 320 px, text resize and spacing, contrast measured on real pixels, target size, hover content.      |
| `engine-at`       | Reads the accessibility tree: names, roles, states, labels, error messages, live regions and announcements.   |
| `engine-widgets`  | Checks ARIA widgets against the keyboard contracts of the ARIA Authoring Practices: tabs, menus, comboboxes.  |
| `ai-*` judges     | Optional. Answer narrow judgment questions about candidates that code selected. Never `violation`.            |
| `persona-*`       | Keyboard-only and screen-reader agents that try to complete tasks you describe.                               |

Analysis lives in small pure functions (for example `isBackwardJump(prev, next)`) that unit-test without a browser; the engine does the browser work around them. Every rule is listed in the [rules reference](/reference/rules/).

## The runner pipeline

`@clear-a11y/runner` is what every app calls. For each target:

```text
crawler (your URLs, plus same-origin links with --crawl)
  -> browser: one page per viewport
  -> engine-states: discover hidden states (menus, dialogs, form errors...)
  -> for the default state and each discovered state:
       replay the state, then run static, keyboard, visual, at, widgets
       (and AI judges or personas when configured)
  -> merge duplicates across states, drop needs-review findings that another
     engine's verified pass settled (kept in `resolved`), apply the tier policy, sort
  -> Finding[] -> reporter: JSON (canonical), SARIF, HTML, text
```

Because the runner replays states and hands the page to every engine, an unlabelled field inside a dialog or a nameless link inside a collapsed menu is found without any engine knowing about the others.

## The Finding

The JSON finding list is the canonical output; SARIF and HTML are derived from it. The Finding schema is a public API: changing it needs an ADR.

```ts
interface Finding {
  id: string; // stable hash of rule + target + state
  ruleId: string; // "keyboard/focus-order-backward"
  wcag: string[]; // ["2.4.3"]
  tier: 'violation' | 'likely' | 'needs-review';
  confidence: number; // 0..1
  engine: string; // "engine-keyboard"
  page: { url: string; state: string; viewport: string };
  target: { selector: string; role?: string; name?: string };
  evidence: {
    screenshot?: string;
    focusPath?: FocusStop[];
    axTree?: string;
    announcement?: string;
    html?: string;
    data?: Record<string, unknown>;
  };
  source?: { file: string; line: number; column?: number; component?: string };
  message: string; // what is wrong and who it affects
  fix?: string; // suggested remediation
  question?: string; // for needs-review: the yes/no a person answers
}
```

## Tiers and trust

| Tier           | Produced by                                                 | Can fail CI by default |
| -------------- | ----------------------------------------------------------- | ---------------------- |
| `violation`    | Deterministic checks with high certainty.                   | Yes                    |
| `likely`       | Strong signals; most AI findings.                           | No                     |
| `needs-review` | Anything a person must decide. Always carries a `question`. | No                     |

The tier policy in `core` downgrades any finding from an AI engine (`ai-*`) to at most `likely`. When a WCAG interpretation is ambiguous, a rule uses `needs-review` instead of `violation`.

A `needs-review` finding is dropped when a different, deterministic engine recorded a verified pass for the same element, page state and viewport with an overlapping success criterion: axe asks "does this text on a gradient have enough contrast?" and the visual engine has already measured the real pixels. Passes never drop `violation` or `likely` findings, and AI or persona passes never drop anything. Every dropped finding is listed in the report's `resolved` array with the measurement that settled it, and counted in `summary.resolved`.

## Measuring it

The benchmark scans `fixtures/site` (pages with seeded barriers, and correct-pattern pages that must produce nothing) and compares the findings with what a human auditor would log. Scoring lives in the runner so that `clear-a11y bench` works for anyone's fixtures. See [How coverage is measured](/concepts/coverage/).

## Decisions

Architecture decisions are recorded as ADRs:

- [ADR index](/architecture/adr/)
- [ADR 0001: Architecture](/architecture/adr/0001-architecture/)
- [ADR 0002: Nx workspace](/architecture/adr/0002-nx-workspace/)
- [ADR 0003: Engines can report verified passes](/architecture/adr/0003-engine-pass-records/)
- [How the GitHub Action works](/architecture/github-action/)
