# Governance

This document describes how Clear A11Y is run: who the maintainers are, how decisions are made, and how you can become a maintainer.

## Maintainers

Maintainers review and merge pull requests, triage issues, cut releases and enforce the Code of Conduct.

<!-- TODO: list maintainers before v0.1 -->

| Name | GitHub | Areas |
| ---- | ------ | ----- |
| TODO | TODO   | TODO  |

## How decisions are made

Most decisions are made by **lazy consensus** on the issue or pull request: a proposal goes ahead unless someone raises a reasoned objection. Silence is agreement, so if you disagree, say so and explain why.

Bigger decisions are written down so they can be found later:

- **Architecture Decision Records (ADRs)** in [docs/adr](docs/adr/README.md) are required for decisions that change the architecture, the Finding schema (a public API), the AI provider policy, or any public API.
- **Requests for Comments (RFCs)** in [docs/rfcs](docs/rfcs/README.md) are required for large new capabilities, such as a new engine, a new app or a new provider type. An RFC is discussed in its pull request and accepted by maintainer approval; accepted RFCs usually lead to one or more ADRs.
- **New rules** are agreed on their issue (the "Rule proposal" form) before code is written.

If consensus can't be reached, the maintainers decide by simple majority vote. Ties keep the status quo.

## Approvals

- **One maintainer approval** is needed to merge a pull request, with CI green, including the benchmark when detection changes.
- **Two maintainer approvals** are needed for:
  - changes to the Finding schema,
  - changes to the AI provider policy (for example, how providers authenticate or what data is sent to them),
  - security-sensitive changes (credential handling, servers, sandboxing, CI and release workflows).
- Maintainers don't approve their own pull requests.

## Becoming a maintainer

Anyone who contributes steadily can become a maintainer. We look for:

- a track record of quality contributions (code, fixtures, rule docs, triage or reviews) over a few months,
- good judgment about accessibility and about the project's principles (deterministic first, evidence on every finding, measure everything),
- constructive, respectful behavior in reviews and discussions.

An existing maintainer nominates the candidate in a private maintainer discussion. If no maintainer objects within one week, the candidate is invited. Maintainers who are inactive for six months may be moved to emeritus status and can return at any time.

## Code of Conduct enforcement

Maintainers enforce the [Code of Conduct](CODE_OF_CONDUCT.md). Reports go to the contact listed there and are handled privately. A maintainer who is involved in a report steps back from handling it. Decisions follow the Code of Conduct's enforcement guidelines.

## Changing this document

Changes to governance are made by pull request and need approval from two maintainers.
