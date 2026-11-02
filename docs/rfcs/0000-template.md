# RFC NNNN: Title

- Status: Draft | Accepted | Rejected | Superseded by RFC NNNN
- Author(s): @github-handle
- Date: YYYY-MM-DD
- Issue: #NNN

## Summary

One paragraph: what you propose and what it gives users.

## Motivation

What problem does this solve? Which barriers do real users hit that we miss today? Link to audit findings, missed-issue reports or benchmark gaps (recall by WCAG success criterion or layer) where you can.

## Detailed design

How it works. Cover:

- which projects are created or changed, with their tags (`type:*`, `scope:*`, `publish:*`),
- how it fits the module boundaries (engines never import engines; `runner` coordinates; apps stay thin),
- what is deterministic and what, if anything, needs AI judgment,
- which tiers its findings get (`violation`, `likely`, `needs-review`) and why,
- what evidence each finding carries,
- configuration and public API changes.

## Measurement

How we'll know it works:

- the fixtures (barrier pages and correct-pattern pages) and expected entries you'll add,
- the expected effect on recall and on precision of `violation` findings.

## Security and privacy

Does it handle untrusted page or repo content, credentials, or send data to a model? How is prompt injection prevented?

## Accessibility of anything we ship

If it adds or changes a UI, how will it pass Clear A11Y with zero `violation` findings?

## Drawbacks

Why might we not do this? Cost, complexity, maintenance, performance.

## Alternatives

Other designs you considered, and why you didn't choose them.

## Unresolved questions

What still needs to be decided, during review or during implementation?
