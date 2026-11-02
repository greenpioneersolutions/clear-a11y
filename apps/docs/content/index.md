---
title: Clear A11Y
description: Open-source accessibility testing that works like a human accessibility expert, not just a rules scanner.
template: splash
---

Clear A11Y finds the accessibility barriers people with disabilities actually run into. Point it at a **live website** or a **source repo**. It opens your pages in a real browser and tests them the way an expert auditor would: it presses Tab and watches where focus goes, opens menus and dialogs, submits forms with errors, zooms to 400%, measures real pixel contrast and reads the accessibility tree that screen readers use.

> **Status: pre-alpha.** Nothing is published to npm yet. You can build it from source and try it today; see [Getting started](/getting-started/).

## Why another accessibility tool?

Rules scanners such as axe-core are excellent, and Clear A11Y runs axe-core too. But a rules scanner only sees part of the picture: practitioners usually report that automated tools find 20 to 40% of what a manual audit finds. The rest only shows up through behavior, such as a focus order that jumps around, a modal that traps you or an error message nobody announces.

Clear A11Y's goal is to find **80% or more of what a human audit finds**. That is a target we measure, not a claim. Read [how coverage is measured](/concepts/coverage/) for the method, today's numbers and their limits.

## What you get

- **Behavior, not only markup.** Engines for [keyboard](/reference/rules/#keyboard), [hidden states](/reference/rules/#hidden-states), [visual](/reference/rules/#visual) checks, the [accessibility tree](/reference/rules/#accessibility-tree-and-announcements) and [ARIA widgets](/reference/rules/#aria-widget-patterns), on top of [axe-core](/reference/rules/static/).
- **Findings you can trust.** Every finding has a tier: `violation` (deterministic, can fail CI), `likely` (a person should confirm) or `needs-review` (a yes/no question for a person). See [tiers](/getting-started/#tiers-how-much-to-trust-a-finding).
- **Evidence for every finding.** The WCAG success criterion, the element, the page and state, and proof: a screenshot crop, the focus path, an accessibility-tree snippet or the announcement text.
- **Where you work.** A [command line](/guides/cli/), [repo scanning](/guides/repo-scanning/) with file and line, a [GitHub Action](/guides/github-action/) for pull requests, an [MCP server](/guides/mcp/) for coding agents and a [self-hosted server](/guides/self-hosting/).
- **AI only for judgment calls, and only if you want it.** Off by default. Bring your own model: an API key or a local model. See [AI providers](/guides/providers/).
- **Open and offline.** Apache-2.0, no account, no required cloud service. The scanner runs on your machine.

## Start here

1. [Getting started](/getting-started/): build it, run your first scan and read the results.
2. [CLI guide](/guides/cli/): everyday commands and options.
3. [Rules reference](/reference/rules/): what each rule catches and how to fix it.
4. [Contributing](/contributing/): the generators, fixtures and benchmark make it safe to add a rule.
