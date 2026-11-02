# Roadmap

Clear A11Y tests like a human accessibility expert: it measures behavior (keyboard, states, reflow, the accessibility tree) in code, and uses AI only for judgment calls. Our target is **80%+ of what a human audit finds**, proven by benchmark against seeded and real (sanitized) audit findings.

Progress through the bootstrap is tracked in [PROGRESS.md](PROGRESS.md). Detailed build plans are in [slices/](slices/README.md).

## Milestones

### v0.1: Bootstrap (waves 0–7)

| Wave | Theme              | Slices      | Outcome                                                                                                                          |
| ---- | ------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Plan               | –           | ADRs, roadmap, slice files                                                                                                       |
| 1    | Foundation         | S00a–d, S01 | Nx workspace, generators, Finding schema, fixtures, benchmark, OSS skeleton, first axe-based scan and the **baseline benchmark** |
| 2    | Behavioral engines | S02–S05     | Keyboard, states, visual, accessibility-tree and widget engines                                                                  |
| 3    | Reports and AI     | S06, S07    | SARIF + accessible HTML report; provider adapters and AI judges                                                                  |
| 4    | Personas and repos | S08–S10     | Task-based persona agents; static and runtime repo scanning                                                                      |
| 5    | Shells             | S11–S13     | GitHub Action, queue + API server, MCP server                                                                                    |
| 6    | Desktop and docs   | S14, S15    | Electron app; documentation site                                                                                                 |
| 7    | Harden             | –           | Wider WCAG 2.2 fixtures, release readiness, final benchmark                                                                      |

Every wave must improve or hold recall against the S01 axe-only baseline, and hold precision of `violation` at or above 0.95.

### v0.2: Real-world calibration

- Seed fixtures from sanitized real audit reports; add the alphagov accessibility-tool-audit page as an external baseline.
- Use needs-review answers from the desktop app as calibration data for tier thresholds.
- Recorded flows (login, checkout) in the crawler.

### v0.3: Depth

- Screen reader verification with Guidepup on macOS/Windows runners (opt-in).
- More APG widget contracts (tree, treegrid, carousel, slider, feed).
- Source mapping for Vue, Svelte and Angular runtime findings.

### v1.0: Stable API

- Finding schema frozen under semver.
- Published benchmark against human audits with a reproducible method.
- Independent versioning reconsidered once packages stabilize.

## Non-goals

- A hosted SaaS. Self-hosting must always be first-class.
- Features that run on a consumer chat subscription login.
- Replacing human audits. We aim to make them faster and catch regressions between them.
