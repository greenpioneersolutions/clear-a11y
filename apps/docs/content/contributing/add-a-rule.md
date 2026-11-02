---
title: Add a rule
description: Scaffold a new rule with the generator, write the fixtures and the pure check, document it and measure it.
---

A rule is one specific check inside an engine, such as `keyboard/focus-order-backward`. Every rule ships with a unit test, a barrier fixture, a correct-pattern fixture that proves there's no false positive, expected findings for the benchmark, and a documentation page. The generator creates all of them so nothing is forgotten.

Agree on the rule on its issue first (use the "Rule proposal" form). For the full contribution flow, see [Contributing](/contributing/).

## 1. Scaffold it

```sh
pnpm nx g @clear-a11y/workspace-plugin:rule --engine=<engine> --name=<rule> --wcag=<sc>
# example
pnpm nx g @clear-a11y/workspace-plugin:rule --engine=keyboard --name=focus-order-backward --wcag=2.4.3
```

Add `--tier=needs-review` when the WCAG interpretation is ambiguous, or `--tier=likely` when a person should confirm. The generator creates:

| File                                                 | What goes in it                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/engines/<engine>/src/rules/<rule>.ts`      | Rule metadata (id, WCAG, tier, title, description, fix) and a pure check function. |
| `packages/engines/<engine>/src/rules/<rule>.test.ts` | The unit test for the pure check.                                                  |
| `fixtures/site/<engine>/<rule>.html`                 | A page with the seeded barrier.                                                    |
| `fixtures/site/<engine>/<rule>-ok.html`              | The correct pattern. Must produce zero findings from every engine.                 |
| `fixtures/expected/<engine>/<rule>.json`, `-ok.json` | What a human auditor would log on each page.                                       |
| `docs/rules/<engine>/<rule>.md`                      | The rule's documentation page.                                                     |

## 2. Fixtures and a failing test first

Make the barrier page show the problem plainly and the `-ok` page show the accessible way to build the same thing. Fill in the expected entries (selector, WCAG criteria, layer, description). Then write the unit test for the pure check and watch it fail.

## 3. The check

Keep the decision in a small pure function (for example `isBackwardJump(prev, next)`) that runs without a browser. The engine collects measurements from the page and calls it. Build selectors with the shared helpers so findings line up with other engines and with the benchmark. Add an integration test (`test/*.integration.test.ts`) that runs the engine on both fixture pages: findings on the barrier page, none on the `-ok` page.

Choose the tier honestly: `violation` only when the check is deterministic and certain. If it can't be made deterministic, propose it for the AI layer instead of shipping a flaky heuristic.

## 4. Document it

Fill in `docs/rules/<engine>/<rule>.md`: what it catches, who it affects, the WCAG success criterion with its W3C Understanding link, why it has its tier, how to fix it (with a short code example) and the fixture examples. Write for a web developer who is new to accessibility.

This site turns that file into the rule's page in the [rules reference](/reference/rules/), together with the metadata from the code. The docs build **fails** if a rule has no page, if a page names a rule that doesn't exist, if the page's tier or WCAG criteria differ from the code, or if the page still contains a `TODO`. So the reference can't drift from the engines.

## 5. Measure it

```sh
pnpm nx run bench:run
```

Paste the before and after recall and precision into your pull request. Precision of `violation` must stay at or above 0.95, and correct-pattern pages must stay silent. See [Fixtures and benchmark](/contributing/fixtures-and-benchmark/).
