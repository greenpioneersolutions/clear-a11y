# @clear-a11y/engine-static

axe-core rules layer: fast, deterministic checks mapped to Clear A11Y findings.

Part of [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). Engines are run by `@clear-a11y/runner`; you rarely use them directly.

## Install

```sh
pnpm add @clear-a11y/engine-static
```

## Usage

```ts
import { createStaticEngine } from '@clear-a11y/engine-static';

const engine = createStaticEngine();
const findings = await engine.run(pageContext); // PageContext from @clear-a11y/browser
```

## Rules

See [`src/rules/`](src/rules/) and the rule pages in [`docs/rules/static/`](../../../docs/rules/static/).

## Development

```sh
pnpm nx test @clear-a11y/engine-static              # unit tests (no browser)
pnpm nx test-integration @clear-a11y/engine-static  # Playwright against fixtures/
```

Add a rule with `pnpm nx g @clear-a11y/workspace-plugin:rule --engine=static --name=<rule-name> --wcag=<sc>`.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (rules reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/engines/static
