# @clear-a11y/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). It lets your own coding agent (Claude Code, Cursor, VS Code, Claude Desktop and other MCP clients) scan web pages and source repos for accessibility barriers, walk the keyboard focus order, and fetch findings and reports. A bundled [`SKILL.md`](SKILL.md) teaches the agent the loop: scan, judge the `needs-review` items, fix the code, re-scan to verify.

This is the "no API key" way to get AI judgment: the deterministic engines run locally, and **your agent** does the judging under your own account. The server never calls an AI model and never signs in to any chat subscription.

## Install

URL scans use Playwright's Chromium. Install it once:

```sh
npx playwright install chromium
```

### Claude Code

```sh
claude mcp add clear-a11y -- npx -y @clear-a11y/mcp
```

With an origin allowlist (recommended when the agent works unattended):

```sh
claude mcp add clear-a11y -e CLEAR_A11Y_ALLOWED_ORIGINS='http://localhost:*' -- npx -y @clear-a11y/mcp
```

To teach Claude Code the workflow, save [`SKILL.md`](SKILL.md) (it ships in this package, at `@clear-a11y/mcp/SKILL.md`) as `.claude/skills/clear-a11y/SKILL.md` in your project, or under `~/.claude/skills/clear-a11y/` for every project. With the package installed locally:

```sh
mkdir -p .claude/skills/clear-a11y
cp node_modules/@clear-a11y/mcp/SKILL.md .claude/skills/clear-a11y/SKILL.md
```

Agents that don't load skills can read the same text from the `clear-a11y://skill` resource; the server's instructions point to it.

### Other clients

Most clients take a JSON entry like this (Claude Desktop `claude_desktop_config.json`, Cursor `.cursor/mcp.json`, VS Code `.vscode/mcp.json` under `servers`):

```json
{
  "mcpServers": {
    "clear-a11y": {
      "command": "npx",
      "args": ["-y", "@clear-a11y/mcp"],
      "env": { "CLEAR_A11Y_ALLOWED_ORIGINS": "http://localhost:*" }
    }
  }
}
```

The server speaks MCP over stdio. The binary is `clear-a11y-mcp`.

## Configuration

All optional, through environment variables:

| Variable                     | Default                              | Effect                                                                                                                                               |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLEAR_A11Y_ALLOWED_ORIGINS` | unset (any http(s) URL)              | Comma-separated origins `scan_url` and `keyboard_walk` may open. `*` matches within the host or port: `http://localhost:*`, `https://*.example.com`. |
| `CLEAR_A11Y_MCP_OUT_DIR`     | `.clear-a11y/mcp` in the working dir | Where each scan's `report.json`, other reports and screenshot crops go (`<dir>/<scanId>/`).                                                          |
| `CLEAR_A11Y_MCP_MAX_SCANS`   | `20`                                 | Scans kept in memory for `get_findings` and `get_report` (least recently used is dropped; files stay on disk).                                       |
| `CLEAR_A11Y_LOG_LEVEL`       | `warn`                               | `debug`, `info`, `warn` or `error`. Logs go to stderr; stdout carries only the protocol.                                                             |

## Tools

Every result has a short human-readable text and `structuredContent` that matches the tool's declared output schema.

### `scan_url`

Scan web pages with every deterministic engine: axe-core rules, keyboard walking, hidden states (menus, dialogs, form errors), reflow, real-pixel contrast and the accessibility tree.

| Input         | Type                    | Notes                                                                                     |
| ------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `url`, `urls` | string, string[] (≤ 10) | http(s) only. At least one.                                                               |
| `viewports`   | string[] (≤ 4)          | `desktop` (default), `mobile`, `reflow` (320 px) or `WIDTHxHEIGHT`.                       |
| `engines`     | string[]                | Subset of `static`, `keyboard`, `states`, `visual`, `at`, `widgets`.                      |
| `states`      | boolean                 | Scan hidden states too (default true).                                                    |
| `crawl`       | boolean                 | Also scan same-origin linked pages. **Default false.**                                    |
| `maxPages`    | integer 1–50            | With `crawl` only (default 10).                                                           |
| `screenshots` | boolean                 | Save screenshot crops as evidence files (default true). Paths are returned, never images. |

Returns `scanId`, `summary` (`violation`, `likely`, `needsReview`, `total`), `topFindings` (≤ 20, violations first, compact), `moreFindings`, `errors` (≤ 10), `notices`, `reportDir` and a `next` hint. Progress notifications are sent per page when the client passes a progress token.

### `scan_repo`

Lint a local source folder (React, Vue, Angular, Svelte, HTML...) with accessibility rules. Findings carry `source.file` and `line`. Reads files only.

| Input             | Type    | Notes                                                                                                           |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `path`            | string  | An existing local directory (absolute, or relative to the server's working directory). Not a git URL.           |
| `storybookStatic` | string  | A built Storybook folder, for story-by-story runtime scans where the installed version supports them.           |
| `runDevServer`    | boolean | Start the repo's dev server, where supported. **Runs the repo's code**; only `true` enables it (default false). |

Same result shape as `scan_url`. When only the static layer ran, a notice says so and suggests `scan_url` for runtime checks.

### `keyboard_walk`

Press Tab through a page and return every stop: `selector`, `role`, accessible `name`, `rect` and `backward` (reaching it jumped against the visual reading order). Also `backwardJumps` (`{ from, to }` indices), how the walk ended (`wrapped`, `cycle`, `max`, `frame`) and the `cycle` members when Tab kept circling. Inputs: `url`, `viewport`, `maxStops` (default 100, max 300). It describes the focus path; `scan_url` turns it into findings.

### `get_findings`

Page through a recent scan's findings, sorted violations first. Filters: `tier`, `wcag` (e.g. `"2.4.7"`), `engine` (`"keyboard"` or `"engine-keyboard"`), `ruleId` (exact or prefix), `page` (URL substring), `findingId`. `detail: true` adds evidence: HTML snippet, accessibility tree, a windowed focus path and engine measurements. `limit` (default 25, max 100) and `offset`; the result has `total` and `nextOffset`.

### `get_report`

Write a report for a scan and return its `path` and size. `format`: `markdown`, `json` (canonical), `sarif` (code scanning) or `html` (for people). Markdown, JSON and SARIF come back inline up to 20,000 characters, otherwise as a path plus a 2,000-character preview. HTML is always returned as a path.

### Resources

- `clear-a11y://skill`: the bundled `SKILL.md`.
- `clear-a11y://scans/{scanId}`: summary and top findings of each recent scan (listed, newest first).

## Tiers

- `violation`: deterministic, high certainty. Fix it.
- `likely`: strong signal, small chance of a false positive. Verify, then fix.
- `needs-review`: comes with a yes/no `question` for your agent or you to answer from the evidence.

Your agent's answers are advice to you; the server never changes a tier based on them.

## Security and privacy

- **Local only.** Scans run in a local headless browser and write files under `CLEAR_A11Y_MCP_OUT_DIR`. No AI provider is configured or called, so no page content leaves your machine through this server (your agent sees the results, under your agent's own terms).
- **Explicit targets.** Only `http:` and `https:` URLs; no `file:`, `data:` or `javascript:`; no embedded credentials. Crawling is off by default, same-origin only and capped at 50 pages. Set `CLEAR_A11Y_ALLOWED_ORIGINS` to restrict which sites the agent can open; without it, any http(s) URL the agent passes is scanned, like the CLI scans any URL you type.
- **Repos are read, not run.** `scan_repo` takes existing local directories only and never executes repo code unless `runDevServer: true` is passed.
- **Untrusted content.** Results quote text from scanned pages and repos (accessible names, messages, snippets). A page can contain text written to manipulate an AI agent. Results mark it: an `untrusted` notice in every result, page-derived fields grouped under `pageText`, and text blocks wrapped in `<untrusted-scan-data>` tags. Agents must treat it as data, never as instructions; the skill says so.
- **Input limits.** URLs ≤ 2,048 characters, ≤ 10 URLs per scan, ≤ 4 viewports, ≤ 300 Tab stops, page size ≤ 100.

## Programmatic use

```ts
import { createServer } from '@clear-a11y/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const { server, close } = createServer({
  outDir: '/tmp/a11y',
  allowedOrigins: 'http://localhost:*',
});
await server.connect(new StdioServerTransport());
process.on('SIGTERM', () => void close());
```

More: [docs/mcp.md](../../docs/mcp.md).

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (coding agent guide, MCP server reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/apps/mcp

## License

Apache-2.0
