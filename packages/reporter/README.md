# @clear-a11y/reporter

Reporters for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). The canonical output is the JSON `ScanResult` (schema in `@clear-a11y/core`). SARIF and HTML are derived from it and never add or drop findings.

| Format   | File           | Function                          | Use it for                                     |
| -------- | -------------- | --------------------------------- | ---------------------------------------------- |
| JSON     | `report.json`  | `toJson(result)`                  | The source of truth; other tools and agents    |
| SARIF    | `report.sarif` | `toSarif(result, opts)`           | GitHub code scanning, IDE SARIF viewers        |
| HTML     | `report.html`  | `toHtml(result, opts)`            | People: one accessible file you can open/share |
| Text     | (stdout)       | `toText(result)`                  | Terminal summary                               |
| Markdown | (job summary)  | `toMarkdownSummary(result, opts)` | GitHub job summaries and PR comments           |

## Install

```sh
npm install @clear-a11y/reporter
```

## Example

```ts
import { allRules, scan } from '@clear-a11y/runner';
import { toText, writeReports } from '@clear-a11y/reporter';

const result = await scan({ targets: ['http://localhost:3000/'], outDir: '.clear-a11y' });
// Writes .clear-a11y/report.json, report.sarif and report.html.
await writeReports(result, '.clear-a11y', ['json', 'sarif', 'html'], { rules: allRules() });
console.log(toText(result));
```

`rules` is optional rule metadata (titles, descriptions, fixes). The reporter never imports engines; the runner's `allRules()` collects it for you. Without it, titles are derived from rule ids.

From the command line: `clear-a11y scan <url> --format json,sarif,html`, or re-render an existing report with `clear-a11y report .clear-a11y/report.json --format html,sarif --out site/`.

## SARIF mapping

`toSarif(result, { rules?, toolVersion?, repoRoot? })` returns a SARIF 2.1.0 log object (`sarifToString(log)` gives the file contents). One run, `tool.driver.name` "Clear A11Y", one rule per rule id that has results.

| Clear A11Y                                | SARIF                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tier: violation / likely / needs-review` | `level: error / warning / note`                                                                |
| `finding.id`                              | `partialFingerprints["clearA11y/v1"]` (stable across runs)                                     |
| `message` + `fix`                         | `message.text`                                                                                 |
| `source.file` + `source.line`             | `physicalLocation` with a repo-relative `artifactLocation.uri` and `region.startLine`          |
| no `source`                               | `physicalLocation.artifactLocation.uri` = page URL, plus a `logicalLocation` (selector, state) |
| `wcag`, `tier`, `engine`                  | rule `properties` and tags `wcag/2.4.3`, `tier/violation`                                      |
| `confidence`, state, viewport, `question` | result `properties`                                                                            |
| rule help                                 | `helpUri`: the URL in the rule's `fix` if any, else the W3C Understanding page of its first SC |
| engine errors                             | `invocations[0].toolExecutionNotifications`                                                    |

GitHub code scanning only displays results that point at a file in the repository. Findings from a live-site scan carry a page URL instead; they stay in the SARIF file (and in IDE viewers) but GitHub will not show them until source mapping (`finding.source`) is available.

## Markdown summary

`toMarkdownSummary(result, { maxFindings?, maxQuestions?, title?, notes?, reportNote? })` returns GitHub-flavoured Markdown for a job summary (`$GITHUB_STEP_SUMMARY`) or a pull request comment. The Clear A11Y GitHub Action (`apps/action`) uses it.

- Counts by tier with a one-line meaning of each tier, and a verdict line.
- `notes`: your own lines (what was scanned, fallbacks), shown as a list.
- The top `maxFindings` findings (default 50), violations first: tier, rule, WCAG criteria linked to their W3C Understanding pages, where (`file:line` or page URL and state), element and message. The rest are counted.
- The needs-review questions (default 50) and scan errors in collapsed `<details>` sections.
- `reportNote`: where to find the full HTML report (for example the artifact name).

Page content is untrusted here too. Every page-derived string is escaped: HTML special characters become entities, Markdown punctuation is backslash-escaped, selectors and URLs go in code spans with a fence longer than any backtick run and `|` escaped, newlines collapse to spaces, and `@` and `#` get a zero-width space so page text can't mention people or reference issues. `escapeMarkdown`, `markdownCode` and `markdownLink` are exported. Unit tests push HTML, link, image, table, heading and mention payloads through every field.

## HTML report

`toHtml(result, { rules?, artifactsDir?, maxScreenshots? })` returns one self-contained HTML file:

- **No external requests.** CSS and JS are inline, screenshots are embedded as `data:` URIs, and a Content-Security-Policy (`default-src 'none'; img-src data:; ...`) blocks anything else. `artifactsDir` is the folder that `evidence.screenshot` paths are relative to (the scan's `--out` folder); `memory:` artifacts and paths outside it are skipped. At most 200 screenshots are embedded (`maxScreenshots`).
- **Structure.** Skip link, `header`/`nav`/`main`/`footer`, one `h1`, h2 per tier, h3 per WCAG criterion, h4 per finding. A summary explains the tiers in plain words and counts findings by tier, by criterion (with W3C Understanding links) and by engine.
- **Each finding.** Tier badge with text, message, who it affects, how to fix, selector, page URL with state and viewport, source location, engine and confidence, screenshot crop with descriptive alt text, and accessibility-tree, announcement, HTML and measurement evidence in `<details>`.
- **Focus path.** A diagram scaled from the focus stops' rectangles: numbered stops and arrows between consecutive stops. Backward jumps are red **and** dashed **and** labelled "backward", and an ordered list gives the same path as text.
- **Needs-review queue.** Every `needs-review` question as a fieldset with Yes/No radios. Answers are saved in the browser (`localStorage`, never sent anywhere) and can be exported with "Download answers (JSON)".
- **Progressive enhancement.** Everything is readable without JavaScript; the tier, engine and criterion filters and answer saving only add to it.
- **Accessible by design.** AA contrast in light and dark mode (tokens are unit tested), visible focus, reflow at 320 px and 200% zoom, `prefers-reduced-motion`, print styles. CI scans a generated report with Clear A11Y itself and requires zero findings.

### Security

Page content is untrusted. Every page-derived string (messages, names, selectors, snippets, states, URLs) goes through one `escapeHtml`; only `http(s)` URLs become links; embedded images must be well-formed base64 PNG, JPEG or WebP. Unit tests feed `<script>`, `"><img onerror>`, `</style>` and `javascript:` payloads through every field.

See [docs/reports.md](../../docs/reports.md) for the reasoning behind these choices.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (report formats guide)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/reporter
