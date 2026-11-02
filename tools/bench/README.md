# bench

Benchmark harness (project `bench`, private). Serves `fixtures/site` on localhost, scans every page listed in `fixtures/expected`, and scores the findings against the expected issues with the scoring module in `@clear-a11y/runner`. When `fixtures/personas.json` exists, its persona tasks run too (deterministic planner, no AI), so the `persona` layer is scored.

```sh
pnpm nx run bench:run                              # writes bench-results/latest.{json,md}
pnpm nx run bench:run -- --label=s01-axe-baseline  # also writes bench-results/s01-axe-baseline.{json,md}
pnpm nx run bench:run -- --filter=keyboard/        # only pages under keyboard/
```

Metrics:

- **Recall**: expected issues matched by a finding of any tier / all expected issues.
- **Precision of `violation`**: `violation` findings that match an expected issue / all `violation` findings. Target: at least 0.95.
- **Recall by WCAG SC** (primary SC of each issue) and **by layer** (the layer we expect to catch it), plus **found by** (which layers actually caught it).
- **Noise**: any finding on a correct-pattern page.

See `fixtures/README.md` for the matching rules.
