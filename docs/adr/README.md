# Architecture Decision Records (ADRs)

An ADR records one significant decision: the context, what we decided, the consequences, and the alternatives we rejected. ADRs are short and they don't change once accepted. To change a decision, write a new ADR that supersedes the old one.

## When you need an ADR

Write an ADR when a change affects:

- the architecture (layers, module boundaries, the engine contract),
- the Finding schema, which is a public API,
- the AI provider policy,
- any other public API (CLI flags, config file, package exports).

Small decisions made along the way go in [`docs/DECISIONS.md`](../DECISIONS.md) instead. Large new capabilities start as an [RFC](../rfcs/README.md).

## Process

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` with the next free number.
2. Open a pull request with the ADR, alongside or before the change it describes.
3. ADRs touching the Finding schema, provider policy or security need two maintainer approvals; others need one.

## Index

| ADR                                 | Title                              | Status   |
| ----------------------------------- | ---------------------------------- | -------- |
| [0001](0001-architecture.md)        | Architecture                       | Accepted |
| [0002](0002-nx-workspace.md)        | Nx workspace setup                 | Accepted |
| [0003](0003-engine-pass-records.md) | Engines can report verified passes | Accepted |
