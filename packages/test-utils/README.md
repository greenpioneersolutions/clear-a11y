# @clear-a11y/test-utils (private)

Test helpers for Clear A11Y. Only test files may import this package (enforced by module boundaries).

- `fixtureHarness()` / `openFixture(path)`: a browser + localhost fixture server, returning a ready `PageContext`, with optional state replay.
- `startFixtureServer()`: serves `fixtures/site`.
- `loadRecording(name)`: recorded AI responses from `recordings/` (no live AI calls in tests).
- `expectFinding(findings, query)` / `expectNoFinding`: readable assertions on findings.
