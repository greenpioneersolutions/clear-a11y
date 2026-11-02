# Build-plan slices

Each slice is a standalone prompt for a coding agent: it restates the constraints from `AGENTS.md` and ADR 0001/0002 it needs, and ends with testable acceptance criteria. The format is defined in `docs/DECISIONS.md` ("Slice file format"). Progress is tracked in [`docs/PROGRESS.md`](../PROGRESS.md); the milestone view is in [`docs/ROADMAP.md`](../ROADMAP.md).

| Slice                               | Wave | Mode                        | Goal                                                                                                                                  |
| ----------------------------------- | ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [S00a](S00a-workspace.md)           | 1    | serial                      | Nx 24 workspace: pnpm + TS project references, ESM, catalog, inferred tasks, module boundaries, Prettier, caching, `nx release`       |
| [S00b](S00b-workspace-plugin.md)    | 1    | serial                      | Local `@clear-a11y/workspace-plugin` with `engine`, `rule` and `fixture` generators                                                   |
| [S00c](S00c-core-fixtures-bench.md) | 1    | serial                      | `core` Finding schema, WCAG map, config, tier policy; `test-utils`; seeded fixtures; benchmark scoring in `runner`; `bench` harness   |
| [S00d](S00d-open-source.md)         | 1    | serial                      | Community files, issue forms, PR template, Renovate, fork-safe `ci.yml`, `codeql.yml`, AGENTS.md commands                             |
| [S01](S01-first-scan.md)            | 1    | serial                      | `browser`, `crawler`, `engine-static` (axe), JSON reporter, `runner`, `clear-a11y scan`/`bench`; axe-only baseline benchmark          |
| [S02](S02-keyboard.md)              | 2    | parallel                    | `engine-keyboard`: focus order vs visual order, focus visible/obscured, traps, mouse-only controls, Escape, focus return, skip links  |
| [S03](S03-states.md)                | 2    | parallel                    | `engine-states`: discover and replay menus, modals, accordions, tabs, tooltips, form error states; runner feeds states to all engines |
| [S04](S04-visual.md)                | 2    | parallel                    | `engine-visual`: reflow, text resize and spacing, clipping, real-pixel contrast, target size, hover/focus content                     |
| [S05](S05-at-widgets.md)            | 2    | parallel                    | `engine-at` (AX tree, names/roles/states, announcements) and `engine-widgets` (APG keyboard contracts); Guidepup opt-in               |
| [S06](S06-reporter.md)              | 3    | parallel                    | SARIF 2.1.0 and a self-contained accessible HTML report with focus-path overlay and review queue                                      |
| [S07](S07-ai.md)                    | 3    | parallel                    | `@clear-a11y/ai`: BYO-model providers, seven AI judges, versioned prompts, prompt-injection hardening                                 |
| [S08](S08-personas.md)              | 4    | parallel                    | Keyboard-only and screen-reader persona agents that attempt tasks and report where they got stuck                                     |
| [S09](S09-repo-static.md)           | 4    | parallel (merge before S10) | `@clear-a11y/repo`: a11y lint normalized to Findings, runtime-to-source mapping, `scan <repo-path>`                                   |
| [S10](S10-repo-runtime.md)          | 4    | parallel (rebase on S09)    | Scan every Storybook story, or start the dev server on opt-in and crawl it                                                            |
| [S11](S11-action.md)                | 5    | parallel                    | GitHub Action: scan changed routes/components, SARIF + job summary, fail on violations                                                |
| [S12](S12-queue-server.md)          | 5    | parallel                    | `@clear-a11y/queue` (SQLite + BullMQ) and the NestJS API server with Dockerfile                                                       |
| [S13](S13-mcp.md)                   | 5    | parallel                    | `@clear-a11y/mcp`: MCP tools over stdio plus SKILL.md (scan → judge → fix → re-scan)                                                  |
| [S14](S14-desktop.md)               | 6    | parallel                    | Electron desktop app: targets, scans, reports, focus overlays, review queue as calibration data, providers                            |
| [S15](S15-docs-site.md)             | 6    | parallel                    | Accessible docs site (Astro Starlight recommended) with generated rules/CLI reference and benchmark table; GitHub Pages               |

Wave 0 (planning) and wave 7 (hardening, release readiness) have no slice files; see `docs/PROGRESS.md`.

## Rules for every slice

- Read `AGENTS.md` and the slice file fully before writing code. Start with a short plan.
- Fixture and failing test first, then detection, then `pnpm nx run bench:run`; record the precision/recall delta in the PR and `docs/PROGRESS.md`.
- In parallel waves, never change `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md` for a serial follow-up.
- Each wave ends with a merge + bench step. Recall must hold or improve against the S01 axe-only baseline; precision of `violation` must stay at or above 0.95.
