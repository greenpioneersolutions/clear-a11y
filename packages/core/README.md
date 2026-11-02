# @clear-a11y/core

Shared foundation of [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y): the canonical **Finding** schema, the trust tiers (`violation`, `likely`, `needs-review`) and the policy that keeps AI findings out of `violation`, the WCAG 2.2 success-criterion map, the scan configuration and the scan result shape. It has no browser or AI dependencies (only `zod`), so you can use it anywhere you read or write Clear A11Y results.

## Install

```sh
npm install @clear-a11y/core
```

## Usage

```ts
import { createFinding, getSuccessCriterion, resolveConfig, tierAtLeast } from '@clear-a11y/core';

// A validated finding with a stable id (rule + target + page state).
const finding = createFinding({
  ruleId: 'keyboard/focus-order-backward',
  wcag: ['2.4.3'],
  tier: 'violation',
  confidence: 0.95,
  engine: 'engine-keyboard',
  page: { url: 'http://localhost:3000/' },
  target: { selector: '#search' },
  message: 'Tab moves focus backward from "Search" to the logo, against the reading order.',
});

getSuccessCriterion('2.4.3')?.understanding; // W3C "Understanding" URL
tierAtLeast(finding.tier, 'likely'); // true: use it to gate CI
resolveConfig({ viewports: [{ name: 'mobile', width: 375, height: 812 }] }); // validated, defaults filled in
```

`needs-review` findings must carry a yes/no `question` for the human reviewer; `createFinding` throws otherwise. Reports from `clear-a11y scan` are `ScanResult` objects: validate them with `ScanResultSchema`.

The Finding schema is a public API. Changes to it go through an architecture decision record and are called out in the changelog.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (concepts, configuration reference, rules)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/core

## License

Apache-2.0
