# Requests for Comments (RFCs)

An RFC is a short design proposal for a **large new capability**, written before the code so that the approach can be discussed while it's still cheap to change.

## When you need an RFC

Write an RFC for:

- a new engine or a new app,
- a new AI provider type, or a new kind of AI judge or persona agent,
- a change that affects several packages or the way users run Clear A11Y,
- anything a maintainer asks to see as an RFC.

You don't need one for a new rule (agree on it in a "Rule proposal" issue), a bug fix, or docs. A decision that changes the architecture, the Finding schema, provider policy or a public API also needs an [ADR](../adr/README.md); an accepted RFC often leads to one.

## Process

1. Copy [`0000-template.md`](0000-template.md) to `NNNN-short-title.md`, using the next free number.
2. Fill it in and open a pull request titled `rfc: <title>`. Link the issue that motivated it.
3. Discussion happens on the pull request. Update the RFC as the design changes.
4. A maintainer approval accepts the RFC (two approvals if it touches the Finding schema, provider policy or security). Set its status to `Accepted` and merge. Rejected RFCs can be merged with status `Rejected` so the reasoning stays on record.
5. Implementation happens in separate pull requests that link the RFC.

## Index

| RFC | Title    | Status |
| --- | -------- | ------ |
| –   | None yet | –      |
