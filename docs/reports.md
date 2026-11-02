# Reports: SARIF and the HTML report

Contributor notes for `packages/reporter`. User-facing format docs are in the package README.

## One source of truth

`report.json` (`ScanResult` from `@clear-a11y/core`) is canonical. `toSarif` and `toHtml` are pure functions of it (plus optional rule metadata), so `clear-a11y report report.json --format html,sarif` can regenerate both at any time. They never add, merge or drop findings; tests check that SARIF has one result per finding.

## HTML report: accessibility decisions

The report is a UI we ship, so it must pass Clear A11Y (AGENTS.md principle 7). `apps/cli/test/report-dogfood.integration.test.ts` scans fixture pages, writes `report.html`, serves it, scans it with every engine and requires **zero** findings of any tier. It also checks that the page makes no network requests, works without JavaScript at 320 px, and that filters, saving and downloading answers work.

Decisions worth knowing before you change the template:

- **Tier is never color alone.** Badges carry the tier name as text; finding cards also use different border styles (solid, double, dotted).
- **Focus path diagrams.** The SVG holds the element boxes and arrows (with the arrowhead at the midpoint so a stop circle never hides it). Stop numbers and the "backward" labels are HTML laid over the SVG so they keep a legible size when the diagram scales down to 320 px. Backward jumps are red, dashed and labelled; the ordered list after the diagram is the text alternative, and the wrapper is `role="img"` labelled by the figure caption. The digits are CSS generated content (`data-n`): single characters as text nodes make axe report "cannot determine contrast" for each one, and the list already carries the numbers as text. Their colors are covered by the palette contrast test.
- **Avoid inline controls that wrap next to each other.** The visual engine flags text overlapping controls when inline boxes wrap at 200% zoom or with text spacing. Lists of links are real lists, and the "Details" link in the review queue sits on its own line.
- **Progressive enhancement.** Without JavaScript every finding and question is visible; the filter form and download button carry `hidden` and the script reveals them. `localStorage` access is wrapped in `try/catch`, and failure is reported in the status region.
- **Colors** are tokens in `src/html/styles.ts`. `styles.test.ts` checks text pairs at 4.5:1 and non-text pairs at 3:1 in both the light and dark palettes. Change a color there, not inline.
- **Determinism.** Findings are sorted (tier, SC, rule, page, state, viewport, selector); no clock is read. The only timestamps are the scan's own `startedAt`/`finishedAt`.

## Security model

- Everything that came from a page (messages, names, roles, selectors, states, snippets, URLs, questions) is escaped with `escapeHtml`. Attributes are always double-quoted. URLs become links only when they parse as `http:`/`https:`.
- Screenshots are read only from inside `artifactsDir`, only with image extensions and under 1.5 MB; `data:` URIs pass through only when they are well-formed base64 PNG, JPEG or WebP.
- CSP: `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`. It blocks every network fetch (scripts, images, fonts, XHR, form posts), so even an escaping bug could not exfiltrate data through a request. `script-src` allows inline scripts rather than a nonce because Playwright's `addScriptTag` (used to inject axe-core) is subject to the page's CSP, so a nonce would stop Clear A11Y from scanning its own report.

## SARIF notes

- Levels: violation -> `error`, likely -> `warning`, needs-review -> `note`.
- `partialFingerprints["clearA11y/v1"]` is `finding.id` (a hash of rule, selector, URL, state and viewport), so GitHub can track an alert across runs.
- Location strategy: repo file and line when `finding.source` exists; otherwise the page URL as `artifactLocation.uri` plus a `logicalLocation` (selector, kind `element`, state and viewport in its properties). GitHub code scanning only shows the first kind.
- Tests validate the required SARIF structure with a hand-written zod shape (no network, no vendored schema).
