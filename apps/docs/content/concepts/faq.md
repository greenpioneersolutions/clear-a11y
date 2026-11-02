---
title: FAQ
description: Short answers to common questions about Clear A11Y.
---

## Does passing Clear A11Y mean my site is accessible?

No. No automated tool can say that. Clear A11Y finds many barriers a rules scanner misses, but some things still need a person: whether alt text is meaningful, whether instructions make sense, whether a video has accurate captions. Treat zero `violation`s as a good floor, answer the `needs-review` questions, and test with real assistive technology and real users.

## How is it different from axe-core?

Clear A11Y runs axe-core as one of its engines. On top of it, it uses the page like a person would: it presses Tab and watches where focus goes, opens menus and dialogs, triggers form errors, zooms and narrows the page, measures contrast on real pixels and listens to what the accessibility tree announces. See [Architecture](/concepts/architecture/#engines).

## What does WCAG mean, and what is a success criterion?

The Web Content Accessibility Guidelines (WCAG) are the W3C standard most accessibility laws and policies refer to. They are organized into testable **success criteria**, numbered like `2.4.3` (Focus Order), each at level A, AA or AAA. Most organizations aim for level AA. Every finding names the success criteria it fails and links to the W3C "Understanding" page that explains it.

## Why is a finding `likely` and not `violation`?

Because a person should confirm it. `violation` is reserved for deterministic checks with high certainty, so a CI build that fails on `violation`s fails for real barriers. See [tiers](/getting-started/#tiers-how-much-to-trust-a-finding).

## Does it send my pages to an AI?

Not unless you configure it. The default AI provider is `none`: nothing leaves your machine. If you turn on the AI judges, you choose the provider (your own API key or a local model through Ollama). See [AI providers](/guides/providers/).

## Can I use my Claude or ChatGPT subscription instead of an API key?

No. Clear A11Y does not log in with consumer chat subscriptions: their terms don't allow third-party products to use them. If you want AI help without an API key, use the [MCP server](/guides/mcp/) from your own coding agent: the agent is the judge.

## Does it work offline?

Yes. Scanning, reports and the benchmark run locally in a headless browser. Only an AI provider you configure would make network requests.

## Can it scan pages behind a login?

Yes. Save a Playwright storage-state file with a logged-in session and set `auth.storageState` in the [config file](/reference/configuration/). Don't commit that file.

## It reported something that isn't a problem. What now?

Please [report the false positive](/contributing/#reporting-false-positives-and-missed-issues) with a minimal HTML reproduction. It becomes a correct-pattern fixture, so the fix is measured and stays fixed.

## Is this site tested with Clear A11Y?

Yes. Every build of this site is scanned with the full engine set at desktop and mobile sizes, and the build fails on any `violation`. See [Docs site](/contributing/docs-site/).
