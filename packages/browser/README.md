# @clear-a11y/browser

Browser layer for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y): Playwright sessions, viewports, auth storage state, CDP access, the **engine contract** (`Engine`, `PageContext`, `StateMeta`), the shared `selectorFor` helper, evidence screenshots and a localhost-only static server.

```sh
pnpm add @clear-a11y/browser
```

```ts
import { launchBrowser, gotoAndSettle, createPageContext, VIEWPORTS } from '@clear-a11y/browser';
import { resolveConfig } from '@clear-a11y/core';

const session = await launchBrowser();
const { page, close } = await session.newPage(VIEWPORTS.desktop);
await gotoAndSettle(page, 'http://localhost:3000/');
const ctx = createPageContext({
  page,
  url: page.url(),
  viewport: VIEWPORTS.desktop,
  config: resolveConfig(),
});
// engine.run(ctx) -> Finding[]
await close();
await session.close();
```

Engines implement `{ name, mutatesPage?, run(ctx) }`. Set `mutatesPage: false` for read-only engines so the runner can share one page load between them.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (engine contract, configuration)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/browser
