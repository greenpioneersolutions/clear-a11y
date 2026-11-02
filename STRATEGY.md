# Strategy

This document explains why Clear A11Y exists, the bet it makes, and how every part of the project serves that bet. For the technical contract see [AGENTS.md](AGENTS.md). For the plan and milestones see [docs/ROADMAP.md](docs/ROADMAP.md).

## The problem

Automated accessibility testing has stalled at the same ceiling for years. axe-core is the best rules engine there is: it's accurate, fast and free. Even so, Deque's own data says it finds about 57% of real-world issues by volume, and practitioners usually say automated tools catch 20–40% of what a manual audit finds. Teams end up with two bad options:

- **Run a scanner, get a green check and ship barriers anyway.** The page passes axe, but a keyboard user gets stuck in the comment box, a screen reader never hears the form error, and the layout breaks when someone zooms in.
- **Pay for a manual audit.** It's thorough, but it's slow and expensive, and it's out of date by the next release. Regressions between audits go unnoticed.

The gap isn't that scanners are badly built. A rules engine reads the page as it was first loaded. Most real barriers only show up in **behavior**: where focus goes when you press Tab, what happens when a menu opens, what the screen reader announces, and whether content survives 320 pixels, 200% text or a dark background image.

## The bet

**Most of what a human auditor checks can be measured in code, if you test the way a person tests instead of reading the page once.**

A human auditor doesn't just look at markup. They press Tab and watch where focus goes. They open every menu and dialog. They submit a form empty to see the errors. They zoom to 400% and shrink the window. They listen to the screen reader. Clear A11Y does those same things in a real browser, deterministically, on every page and every state.

What's left after that, judgment calls about meaning and intent, goes to an AI model, and only when you've configured one. Its answers are never treated as certain.

The target is **80% or more of what a human audit finds**, proven by measurement against real human findings, never just claimed.

## What axe-core gets, what it misses, what we add

We don't replace axe-core. It runs inside our `static` engine, limited to WCAG A/AA rules. Everything else is the part axe structurally can't see, because it requires interacting with the page.

| Area                          | axe-core (rules on the loaded page)                                   | What Clear A11Y adds                                                                                                                                                                                                     | Who it protects                                |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Markup and names              | Missing alt, labels, roles, ARIA misuse, color contrast of plain text | Kept as is. axe is excellent here                                                                                                                                                                                        | Screen reader and low-vision users             |
| Keyboard (`keyboard`)         | Very little: it can't press keys                                      | Walks the real focus order and compares it with the visual order; finds traps, invisible focus, focus hidden under sticky headers, unreachable controls, broken skip links, and focus not returned after a dialog closes | Keyboard-only and switch users                 |
| Interactive states (`states`) | Only what's visible at load                                           | Opens menus, dialogs, accordions and tooltips, and submits forms empty and invalid. Every other engine then re-checks each state                                                                                         | Everyone: most barriers live in states         |
| Visual (`visual`)             | Contrast of text against a flat color                                 | Reflow at 320 px, 200% text, text spacing, real-pixel contrast over images and gradients, target size, hover/focus content, motion                                                                                       | Low-vision, magnifier and motor-impaired users |
| Accessibility tree (`at`)     | Static ARIA validity                                                  | What assistive technology actually gets: computed names and roles, live regions, whether errors and status messages are announced, autocomplete purpose                                                                  | Screen reader users                            |
| Widgets (`widgets`)           | Role attributes only                                                  | ARIA Authoring Practices keyboard contracts: tabs, menus, combobox, listbox, dialog, disclosure, grid actually respond to the keys they promise                                                                          | Keyboard and screen reader users               |
| Judgment (`ai`, optional)     | Nothing                                                               | Is this alt text meaningful? Is this link's purpose clear? Is this heading descriptive?                                                                                                                                  | Everyone, where meaning matters                |
| Tasks (`persona`, optional)   | Nothing                                                               | An agent tries a real task keyboard-only or screen-reader-only and reports where it got stuck                                                                                                                            | Everyone, across multi-page flows              |
| Source (`repo`)               | Runs on a rendered page only                                          | Lints React and Vue source, scans every Storybook story, and maps findings to file and line                                                                                                                              | Developers, before code ships                  |

On our seeded fixtures, which cover all 55 WCAG 2.2 A/AA success criteria, axe-core alone finds **14.2%** of the issues. Clear A11Y, with no AI configured, finds **85.8%** with **100% precision** on `violation` findings and **zero** findings on 120 correct-pattern pages. By layer: accessibility tree 31/31, keyboard 16/16, widgets 11/11, states 8/8, visual 18/20, static 8/9. Read [How we measure](#how-we-measure-and-why-were-honest-about-it) before quoting these numbers.

## The principles, and why each one matters

### 1. Deterministic first, AI second

Anything that can be measured is measured in code: focus position, pixel contrast, overflow, the accessibility tree. AI handles only judgment calls about meaning, context and intent.

**Why:** deterministic checks are reproducible, fast, free and explainable. A team can fail a build on them. An AI that guesses about focus order would be slower, cost money, vary from run to run and be wrong in ways no one can debug. AI earns its place only where code genuinely can't decide.

### 2. Protect trust with tiers

Every finding is one of three tiers:

- **`violation`:** deterministic and high certainty. Allowed to fail CI.
- **`likely`:** a strong signal with a small chance of a false positive. Most AI findings land here.
- **`needs-review`:** a person decides, answering a short yes/no question.

AI findings are **never** `violation` unless a deterministic check confirms them. This is enforced in `core`, not left to each engine.

**Why:** the fastest way to kill an accessibility tool is false positives. One bogus CI failure and teams turn the tool off forever. Tiers let us report everything useful while promising that the findings that block a merge are right. Our bar is **95% or better precision on `violation`**, and the benchmark checks it on every change. When a WCAG interpretation is ambiguous, the rule becomes `needs-review`, not `violation`.

### 3. Evidence or it didn't happen

Every finding carries the WCAG success criterion, a selector, the page, state and viewport, evidence (a screenshot crop, the focus path, an accessibility-tree snippet or the announcement text), the engine that produced it, its confidence and, for repos, the source file and line.

**Why:** a developer new to accessibility can't act on "2.4.3 failed." They can act on "Tab moves from Country back up to Last name," next to a diagram of the focus path. Evidence also makes false positives easy to report, and those reports become fixtures.

### 4. Measure everything

No detection change merges without a benchmark result. Every rule ships with a page containing the seeded barrier, a correct-pattern page that must produce no findings, an expected-findings entry and unit tests.

**Why:** "tests like a human expert" is an easy claim and a hard one to prove. The benchmark makes progress and regressions visible, by WCAG criterion and by engine layer, so we know which layer earned what and where the gaps are.

### 5. One engine, two entry points

The same engines scan **live websites** and **source repos**. A repo can be linted without running its code, scanned through its Storybook, or (opt-in) booted and crawled.

**Why:** finding a barrier in production is late. Finding it in a pull request, pointing at the line that caused it, is when it's cheapest to fix. One engine means one Finding format and one set of rules, whichever door you come in through.

### 6. Bring your own model

AI is **off by default**. When you turn it on, you choose the provider: Anthropic or OpenAI keys, Azure, or a local model through Ollama. Keys come only from environment variables you name.

We don't build features that run on a consumer chat-subscription login. If you don't want an API key, run our MCP server from your own coding agent, and your agent becomes the judge.

**Why:** accessibility testing sees screenshots and DOM, sometimes from internal apps. Nothing should leave the machine unless the user chose that. Using consumer subscriptions in a third-party tool also breaks provider terms.

### 7. Open and self-hostable

There's no required SaaS, account, Nx Cloud or secret. A fresh fork installs, builds, tests and benchmarks offline. The license is Apache-2.0.

**Why:** accessibility is a public good, and teams in regulated or air-gapped environments need it most. An open benchmark also means anyone can check our numbers instead of trusting them.

### 8. Practice what we test

Everything we ship with a UI (the HTML report, the docs site, the desktop app) must pass Clear A11Y with zero `violation`s. CI scans our own outputs on every change.

**Why:** an accessibility tool with an inaccessible report has no credibility. Dogfooding also catches our own false positives before users do.

## Safety by design

The scanner touches real sites and reads untrusted content, so safety is part of the strategy, not an afterthought:

- **It never changes the site.** While exploring states, every form post and every navigation away from the page is blocked in the browser. Controls named like "delete," "pay," "log out" or "unsubscribe" are never clicked.
- **It only scans what you ask.** Only the URLs you list are scanned, plus same-origin links with `--crawl`.
- **Page text can't steer the AI.** Page and repo content is treated as data, never as instructions, and a fixture proves a hostile page can't change a judge's verdict.
- **Repo code runs only with your opt-in.** Running a repo's dev server or loading its own lint plugins happens only with an explicit flag, for repos you trust.

## Meet people where they work

The engines live in libraries. Every product is a thin shell over the same `runner`, so each entry point gets every improvement at once:

| Shell              | For                 | Role in the strategy                                                                |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| CLI (`clear-a11y`) | Developers and CI   | The fastest path from "curious" to a real report                                    |
| GitHub Action      | Pull requests       | Scans what changed, posts SARIF to code scanning and fails only on `violation`      |
| MCP server         | Coding agents       | The agent scans, reads the evidence, fixes the code and re-scans. No API key needed |
| API server         | Teams and platforms | Self-hosted scanning with a queue (SQLite, or Redis/BullMQ)                         |
| Desktop app        | Auditors and QA     | Manage targets, view reports, answer `needs-review` questions                       |
| Docs site          | Everyone            | Rule pages, method and benchmark results                                            |

## Architecture that enforces the strategy

The repo is an Nx monorepo. Its module boundaries aren't just style; they keep the strategy from eroding over time:

- **`core` has no browser or AI dependencies.** The Finding schema and the WCAG map stay pure and stable. The Finding is a public API, and changing it requires an ADR.
- **Engines never import other engines.** Coordination, such as states feeding the keyboard walker, happens in `runner`. Each layer stays independently testable and measurable, which is what makes per-layer recall meaningful.
- **Apps contain no detection logic.** A rule added once works in the CLI, the Action, MCP, the server and the desktop app.
- **Lint enforces these boundaries.** Breaking one fails the build, and the rule is never loosened to get past it.

## How we measure, and why we're honest about it

`fixtures/site/` holds small pages, each with one seeded barrier, plus correct-pattern pages that must stay silent. `fixtures/expected/` lists what a human auditor would log. `pnpm nx run bench:run` reports:

- **Recall** (any tier), overall, by WCAG success criterion and by engine layer.
- **Precision of `violation`**, which must stay at or above 0.95.
- **Noise:** findings on correct-pattern pages, which should be zero.

|                                            | Recall    | Precision of `violation` | Noise              |
| ------------------------------------------ | --------- | ------------------------ | ------------------ |
| axe-core only, 113 issues                  | 14.2%     | 100%                     | 1                  |
| **Clear A11Y, no AI**                      | **85.8%** | **100%**                 | **0 of 120 pages** |
| Repo layer (React, Vue, Storybook samples) | 100%      | 100%                     | 0                  |

**What these numbers don't prove yet.** The fixtures were written alongside the engines that detect them, so they show the engines catch the barriers we designed. They are **not yet** recall against a real human audit, and the 80% target is **not yet proven**. Real sites will also expose false positives that seeded pages don't. We publish this caveat everywhere the numbers appear, because a tool built on trust can't overstate its own coverage.

**Where the remaining 14.2% sits:**

- **Deterministic gaps:** tables whose headers are only bold cells (1.3.1), reading order (1.3.2) and flashing content (2.3.1).
- **Judgment-only criteria that need a model:** for example, meaningful sequence of instructions (1.3.3), images of text (1.4.5), descriptive headings (2.4.6) and language of parts (3.1.2).
- **Multi-page criteria that need persona tasks:** consistent navigation (3.2.3), redundant entry (3.3.7) and others.

## What we're not doing

- **Replacing human audits.** We aim to make them faster and to catch regressions between them. A person is still the final judge of `needs-review`.
- **A hosted SaaS.** Self-hosting is always first-class.
- **AI as the source of truth.** AI never fails a build on its own.
- **Features tied to a consumer chat subscription.**

## How we get to 80%, proven

1. **Score against real audits.** Seed fixtures from sanitized human audit findings, and use the open alphagov accessibility-tool-audit page as an external baseline. This is the measurement that decides whether the bet pays off.
2. **Calibrate on real sites.** Every false positive found in the wild becomes a minimal fixture and a fix. Precision on real sites matters more than precision on our own pages.
3. **Close the deterministic gaps** (1.3.1, 1.3.2, 2.3.1) before reaching for AI.
4. **Measure the AI layer with real providers** and write persona tasks for multi-page criteria.
5. **Turn reviewers' answers into data.** Answers to `needs-review` questions in the desktop app become calibration data for tier thresholds.

The strategy in one line: **test like a person, in code; use AI only for judgment; never cry wolf; and prove every claim with a benchmark anyone can rerun.**
