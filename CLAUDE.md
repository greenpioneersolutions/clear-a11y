# CLAUDE.md — Clear A11Y

@AGENTS.md

## Claude Code specifics

### Working style
- Work one slice (or one issue) at a time. For slices, read `docs/slices/SXX-*.md` fully before writing code.
- Start with a short plan: projects touched, files to create or change, tests to write.
- Write the fixture and failing test first, then the detection, then run the benchmark.
- Small conventional commits. Outside the one-time bootstrap in `BUILD-ALL.md`, every change is a PR following `CONTRIBUTING.md`.

### Nx habits
- Create projects and rules with generators (`nx g @clear-a11y/workspace-plugin:...`, or the official `@nx/*` generators), never by copying folders.
- Inspect before you change: `nx show project <name>`, `nx graph`, `nx affected --print`.
- After changing dependencies between projects, run `nx sync`.
- If `lint` reports a module-boundary violation, fix the architecture (move code into the right package or into `runner`). Never disable the rule or loosen tags to get past it.
- Prefer inferred targets from Nx plugins; add explicit targets only for custom work.

### Parallel work
- Independent slices (for example, engines/visual and engines/widgets) can run in parallel git worktrees. Never run two parallel tasks that both change `packages/core`.
- Use subagents for research (WCAG details, ARIA Authoring Practices patterns, library and Nx APIs) so the main context stays on the code.

### Verification before saying "done"
1. `pnpm nx affected -t lint typecheck test build`
2. `pnpm nx run bench:run` when engines, rules or fixtures changed; record the precision/recall delta.
3. For report, docs site or desktop UI changes: open it and look at it, and scan it with Clear A11Y itself.
4. Docs updated in the same change (rule page, README, CLI reference, ADR if a decision was made).

### When unsure
- WCAG interpretation: cite the success criterion and the W3C "Understanding" doc; if it's still ambiguous, make the rule `needs-review`, not `violation`.
- If a check can't be made deterministic, say so and propose it for the AI layer instead of forcing a flaky heuristic.

### Don't
- Don't add detection logic inside `apps/`.
- Don't import one engine from another; coordinate in `runner`.
- Don't let an AI judge produce a `violation` on its own.
- Don't add a provider that authenticates with a consumer chat subscription.
- Don't require Nx Cloud, secrets or network access for contributors to build and test.
- Don't publish packages locally; releases come from CI only.
- Don't expand a task's scope silently. Propose it.
