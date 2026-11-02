# Clear A11Y in the enterprise

A guide for engineering leaders, platform and developer-experience teams, accessibility program owners and security reviewers who want to roll out Clear A11Y across many teams and applications. It explains the strategy to take, the order to roll it out in, how it fits into your pipelines and how developers use it day to day.

## Read these first

Clear A11Y is built around a small number of firm principles. Your rollout will go better if the people leading it understand them before they write any pipeline code.

1. **[STRATEGY.md](STRATEGY.md):** why the project exists, what axe-core catches and what it misses, and how each engine closes the gap. Start here. Everything below assumes it.
2. **[README.md](README.md):** what it does, the quickstart and the current benchmark.
3. **[AGENTS.md](AGENTS.md)** and **[CLAUDE.md](CLAUDE.md):** the technical contract: architecture, trust tiers, the Finding format, security and privacy rules, and how AI coding agents are expected to work in the codebase. Read them even if you never contribute. They tell you exactly what the tool will and won't do with your pages, code and data.
4. **Operational guides in [`docs/`](docs/):**
   - [repo scanning](docs/repo-scanning.md)
   - [GitHub Action](docs/github-action.md)
   - [MCP server](docs/mcp.md)
   - [AI providers](docs/providers.md)
   - [self-hosting](docs/self-hosting.md)
   - [desktop app](docs/desktop.md)
   - [reports](docs/reports.md)
   - [release process](docs/release.md)
5. **[SECURITY.md](SECURITY.md)** and **[GOVERNANCE.md](GOVERNANCE.md)** for your vendor and open-source review.

## Set expectations honestly

- **It's 0.x software.** The Finding format and APIs may change before 1.0. Pin versions and read the changelog before upgrading.
- **It isn't on npm yet.** Version 0.1.0 is tagged in this repository. Until packages are published, build from the `v0.1.0` tag (see [Install for your organization](#install-for-your-organization)). The GitHub Action becomes available as `@action-v0` with the first npm release.
- **The benchmark is promising but unproven on your sites.** On seeded fixtures, Clear A11Y finds 85.8% of issues against 14.2% for axe-core alone. Those fixtures were written alongside the engines, though. Your own pilot (step 1 below) is what tells you how much of _your_ audits it catches.
- **It doesn't replace human audits.** It makes audits cheaper and catches regressions between them. Keep a periodic expert audit, and use Clear A11Y so the auditor spends time on judgment instead of rediscovering keyboard traps.

## The operating model: four loops

A healthy rollout runs Clear A11Y in four places. Each one catches problems at a different cost.

| Loop                | Where                                            | Who                            | What it catches                                                                      | What it may block                        |
| ------------------- | ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| **1. Inner loop**   | Developer laptop and coding agent                | Every developer                | Barriers in the page or component being built, before commit                         | Nothing. It's advice                     |
| **2. Pull request** | CI on every PR                                   | App teams                      | New `violation`s in the routes, stories and files the PR changed                     | Merge, on `violation` only               |
| **3. Scheduled**    | Nightly or weekly against staging and production | Platform or accessibility team | Regressions from content, configuration, third-party scripts and pages no PR touched | Nothing. It feeds dashboards and tickets |
| **4. Audit**        | Periodic expert review                           | Accessibility specialists      | Judgment calls, `needs-review` answers, real assistive-technology testing            | Releases, by your policy                 |

The tiers decide what flows where. Only `violation` findings should ever block a merge. `likely` findings become tickets, and `needs-review` findings go to a person who answers a yes/no question.

## Roll it out in phases

Don't switch it on everywhere at once. One false failure that blocks a release can cost the program its credibility, so earn trust first.

### Phase 1: Evaluate on one application (2–4 weeks)

1. Pick an application that has a **recent manual audit report**.
2. Scan its staging environment: the audited pages, at desktop and mobile sizes, logged in if needed.
3. **Score it yourself.** Go through the audit's issues and mark which ones Clear A11Y found (any tier). That's your real recall. Then go through Clear A11Y's `violation` findings and mark any that are wrong. That's your real precision.
4. Report false positives and missed issues upstream with the issue forms, each with a minimal HTML reproduction. They become fixtures and fixes for everyone.
5. Decide go/no-go on the evidence. The project's own bar is 95% or better precision on `violation`.

### Phase 2: Developers use it locally

Give every developer the CLI and the MCP server (see [Developers: the local workflow](#developers-the-local-workflow)) before any gate exists. People adopt a tool that helps them faster than one that blocks them.

### Phase 3: Report-only in pull requests

Add the PR scan with `fail-on: never`. For two to four weeks, teams see findings in the job summary and code scanning without being blocked. Watch for false positives and fix configuration such as route maps, crawl exclusions and login.

### Phase 4: Gate on `violation` for changed code

Switch to `fail-on: violation` with `changed-only: true`. New code must not add deterministic violations; existing debt doesn't block anyone. Expand from the pilot team to others one team at a time.

### Phase 5: Scheduled scans and the debt backlog

Run full-site scans on a schedule, track the totals over time and turn existing findings into backlog items, prioritized by the user journeys that matter most (sign-up, checkout, account, support).

### Phase 6: Program maturity

Add AI judges with an approved provider, persona tasks for your key journeys, and the desktop app for auditors answering `needs-review` questions. Measure recall against each new manual audit.

## Install for your organization

**Today (0.1.0, from source).** Build from the tag in CI or on an internal build agent:

```sh
git clone --branch v0.1.0 https://github.com/greenpioneersolutions/clear-a11y.git
cd clear-a11y
corepack enable && pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm nx run-many -t build -p tag:publish:public
node apps/cli/dist/main.js --version     # 0.1.0
```

**Once on npm.** Packages are published from CI with **npm provenance**, so your supply-chain tooling can verify they were built from this repository by its release workflow. Mirror `clear-a11y` and `@clear-a11y/*` through your internal registry (Artifactory, Nexus, GitHub Packages), pin exact versions and let Renovate or Dependabot propose upgrades.

**Browsers.** The engines drive Chromium through Playwright, pinned at 1.61.1. Pre-install the matching browser in your CI images (`npx playwright@1.61.1 install --with-deps chromium`) and cache it, so pipelines don't download it on every run.

## Configuration as code

Keep a shared config in a central repository and let teams extend it. Every option is described in the docs site's configuration reference.

```json
{
  "viewports": [
    { "name": "desktop", "width": 1280, "height": 800 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "crawl": { "enabled": true, "maxPages": 50, "exclude": ["/logout", "/admin/*"] },
  "auth": { "storageState": "auth/staging-user.json" },
  "ai": { "provider": "none" },
  "output": { "formats": ["json", "sarif", "html"] }
}
```

- **Logged-in pages.** Create a Playwright storage-state file for a **dedicated test account** in a setup step, and treat it as a secret: never commit it, delete it after the job, and rotate the account's password.
- **Viewports.** Always include a mobile size. Reflow, target-size and text-resize problems often show up only there.
- **Crawl exclusions.** Exclude sign-out, admin and any URL that changes state on GET. The scanner already blocks form posts and destructive-looking controls, but defense in depth is cheap.

## Pipelines

### GitHub Actions

```yaml
name: Accessibility
on: pull_request

jobs:
  a11y:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # upload SARIF to code scanning
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # needed to find the files the PR changed
      - run: npm ci && npm run build && (npm start &) # or point base-url at a preview deployment
      - run: npx playwright@1.61.1 install --with-deps chromium
      - uses: greenpioneersolutions/clear-a11y@action-v0
        with:
          base-url: http://localhost:3000
          routes: .github/a11y-routes.json # which source files affect which routes
          storybook-static: storybook-static # optional: scan changed stories
          config: .github/clear-a11y.json
          changed-only: 'true'
          fail-on: violation # use "never" during the report-only phase
      - uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: clear-a11y-report/report.sarif
```

The Action works out what the PR changed (`git diff` against the base, no API token needed), maps changed files to routes (Next.js is detected automatically) and to Storybook stories, scans only those, and writes SARIF, HTML and a job summary. Story findings are mapped back to source files, so they appear as code-scanning annotations on the right line. Findings that only have a page URL stay in the SARIF file but aren't displayed by code scanning; the job summary and the HTML report cover them, so upload `clear-a11y-report/` as an artifact too. Use the `pull_request` event, never `pull_request_target`: the job builds and runs the PR's code, which must not run with write permissions or secrets. Full details are in the [Action README](apps/action/README.md).

### GitLab CI, Azure DevOps, Jenkins and others

Use the CLI directly. It needs no platform integration:

```sh
clear-a11y scan "$PREVIEW_URL" --config clear-a11y.json \
  --format json,sarif,html --out a11y-report --fail-on violation
```

- **Exit codes:** `0` means nothing at or above the `--fail-on` tier was found; `1` means the gate failed.
- **Artifacts:** publish `a11y-report/report.html` as a build artifact so reviewers can open the accessible report with screenshots and focus paths.
- **SARIF:** feed `report.sarif` to any tool that reads it. `report.json` is the canonical output for your own dashboards.
- **Source scanning without a browser:** `clear-a11y scan .` lints React and Vue source and never runs your code. It's a cheap first job on every commit.

### Handling existing accessibility debt

Most enterprise applications start with findings. Don't let that debt block every team on day one:

- Gate **only changed code** (`changed-only: true` in the Action, or scan only the routes a change affects).
- Gate **only on `violation`**. `likely` and `needs-review` should never fail a build.
- There's **no built-in baseline file yet**. Each finding's `id` is a stable hash of rule, target and state, so a small script that compares the `id`s in `report.json` against a stored baseline can fail only on new findings. Treat this as a stopgap, and ask for (or contribute) a built-in baseline.

### Scheduled scans

Run a nightly job, or the self-hosted server, against staging and production with a crawl. Store each `report.json` and chart `summary.byTier` and `summary.bySc` over time. A spike usually means a shared component, a content change or a third-party script, none of which a PR gate would catch.

## Developers: the local workflow

The cheapest accessibility fix is the one made before the commit.

**1. Scan what you're building.**

```sh
clear-a11y scan http://localhost:3000/checkout --format html --out .clear-a11y
clear-a11y scan . --storybook-static storybook-static      # every story, mapped to source
```

**2. Read the report.** Each finding gives the WCAG criterion, the element, who's affected, evidence and a suggested fix. Fix `violation`s first. They're certain, and they'll fail the PR anyway.

**3. Use your coding agent.** Register the MCP server in Claude Code or any MCP client, and the agent can scan, walk the keyboard focus path, judge `needs-review` items, fix the code and re-scan in one loop. The developer's own agent is the judge, so **no API key and no extra AI spend** is needed. See [docs/mcp.md](docs/mcp.md) and the bundled [SKILL.md](apps/mcp/SKILL.md).

**4. Learn while fixing.** Every rule has a docs page explaining what it catches and how to fix it, written for web developers new to accessibility. Link those pages from your engineering handbook.

Suggested team norms:

- Run the scan before opening a PR for any UI change.
- Add a Storybook story for every new interactive component. Stories are scanned in isolation and mapped to source.
- When you disagree with a finding, file a false-positive report with a minimal reproduction instead of ignoring it.

## AI: policy and data governance

AI is **off by default** (`"provider": "none"`). Nothing from a page leaves the machine unless someone configures a provider, so the deterministic engines alone are a safe default for every team.

When you enable AI:

- **Choose a provider your data policy already approves.** Azure OpenAI in your own tenant and Ollama on your own hardware keep data inside your boundary. Anthropic and OpenAI APIs are also supported. Bedrock and Vertex are planned.
- **Keys come only from environment variables you name** (`apiKeyEnv`). They're never stored in config files or reports. Use your secret manager.
- **AI can't fail a build.** AI findings are capped at `likely` unless a deterministic check confirms them, and this is enforced in the core library.
- **It resists prompt injection.** Page and repo text is treated as data, never as instructions, and a fixture proves a hostile page can't change a judge's verdict.
- **There are cost controls:** limit which judges run (`ai.judges`) and run AI in scheduled scans rather than on every PR. See [docs/providers.md](docs/providers.md).
- **Consumer chat subscriptions aren't supported.** Developers who want AI judgment without a key use the MCP server from their own agent.

## Security review checklist

- **It doesn't change scanned sites.** While exploring, every non-GET request and every navigation away from the page is blocked in the browser, and controls named like delete, pay, log out or unsubscribe are never clicked.
- **It scans only the targets you list,** plus same-origin links when crawling. The Action refuses route maps that point outside `base-url`.
- **Repo code runs only on opt-in.** Starting a dev server (`--boot`) or loading a repo's own lint plugins (`--trust-repo-plugins`) requires an explicit flag. Plain repo scans never execute repository code.
- **The self-hosted server:**
  - binds to loopback by default;
  - requires `CLEAR_A11Y_TOKEN` when exposed;
  - restricts targets with `ALLOWED_TARGETS` and refuses private and metadata addresses (SSRF guard);
  - refuses AI keys in requests.

  Run it on a network segment without access to internal services if untrusted users can submit URLs. See [docs/self-hosting.md](docs/self-hosting.md).

- **Login state files** are secrets. Use a dedicated test account.
- **Supply chain:**
  - Apache-2.0 license; third-party notices in [NOTICE](NOTICE) (axe-core is MPL-2.0);
  - npm provenance on releases;
  - CodeQL runs on the repository;
  - pin versions.
- **Vulnerabilities** are reported privately per [SECURITY.md](SECURITY.md).

## A self-hosted accessibility platform

For organizations that want central scanning instead of, or alongside, per-repo CI:

- **The API server** is NestJS with a job queue: SQLite on one machine, Redis/BullMQ for more workers. It ships as a Dockerfile you build and scan with your own image pipeline. Teams submit scans through the API, and reports are stored per scan.
- **The desktop app** is for auditors and QA. It manages targets, runs scans, shows reports and answers `needs-review` questions. Those answers are the calibration data that will let tier thresholds be tuned to real audits.

## Roles and ownership

| Role                      | Owns                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Platform / DevEx team     | CI templates, browser images, the shared config, the self-hosted server, version upgrades   |
| App teams                 | Route maps, Storybook coverage, fixing findings in their code, keeping their gate green     |
| Accessibility specialists | Answering `needs-review` questions, periodic audits, scoring recall in each audit, training |
| Security                  | Reviewing the AI provider choice, login-state handling and server exposure                  |
| Engineering leadership    | The gating policy, the debt-reduction target, and making accessibility part of "done"       |

## Measuring success

Track a few numbers per application and across the portfolio:

- **New `violation`s merged:** the goal is zero once the gate is on.
- **Open findings by tier and WCAG criterion,** trending down.
- **Time from detection to fix** for `violation` and `likely` findings.
- **`needs-review` questions answered,** and how often the answer was "yes, it's a problem".
- **Recall against each manual audit:** the share of the auditor's issues Clear A11Y had already found. This is the number that shows the program is working.
- **False positives reported:** these should fall as reports turn into upstream fixes.

## Give back

Every false positive and missed issue you report with a minimal HTML reproduction becomes a fixture, a fix and a benchmark data point for every user, your other teams included. Sanitized findings from real audits are the most valuable contribution of all, because they're how the project proves, or disproves, the 80% target. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Rollout checklist

- [ ] Leads have read STRATEGY.md, README.md, AGENTS.md and CLAUDE.md.
- [ ] A pilot app with a recent audit has been scanned and scored (recall and precision).
- [ ] False positives and missed issues have been reported upstream.
- [ ] The CLI and MCP server are available to developers, and the handbook links the rule docs.
- [ ] The shared config is published, covering viewports, crawl exclusions and login.
- [ ] The PR scan is running in report-only mode (`fail-on: never`).
- [ ] The PR gate is on for `violation` with `changed-only`.
- [ ] Scheduled scans are running against staging and production, with trends tracked.
- [ ] Existing debt is triaged into the backlog by key user journeys.
- [ ] An AI provider decision has been made (or AI is deliberately left off).
- [ ] Recall is scored at every manual audit.
