---
engine: repo-eslint
---

# Repo rules (static source lint)

The repo static layer lints a source repository's components with [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) (React family), [eslint-plugin-vuejs-accessibility](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility) (Vue) and, when you opt in, the Angular template accessibility rules. It runs under a fixed configuration and never runs code or config from the repo.

Rule ids are `repo/<plugin>/<rule>`, for example `repo/jsx-a11y/alt-text`, `repo/vuejs-accessibility/form-control-has-label` or `repo/angular-template/alt-text`. The engine is `repo-eslint`. Every finding has `source.file`, `source.line` and `source.column`.

| Lint result                                                                 | Clear A11Y tier                        | Confidence |
| --------------------------------------------------------------------------- | -------------------------------------- | ---------- |
| Unambiguous in source (literal DOM element, no spread props; see the table) | `violation`                            | 0.95       |
| Default                                                                     | `likely`                               | 0.7        |
| Context-dependent (`no-autofocus`, `img-redundant-alt`)                     | `needs-review`, with a yes/no question | 0.5        |

The complete rule → WCAG mapping, the tier policy and the rules we deliberately don't run are in [Repo scanning](../../repo-scanning.md#rule-mapping). The machine-readable source of truth is `packages/repo/src/static/rule-map.ts`.

## Why lint isn't enough on its own

Lint sees the markup you write, not what renders: props passed in by callers, CSS, focus movement, announcements and reflow are invisible to it. Scan the running app's URL for those, and treat repo findings as early warnings with exact file and line.

## Fixtures

- Barriers and correct patterns: `fixtures/repos/react-sample/`, `fixtures/repos/vue-sample/` (`*Ok.*` files must produce nothing)
- Expected findings: `fixtures/repos/<name>/expected.json`
