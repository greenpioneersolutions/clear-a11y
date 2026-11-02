# Changelog

## 0.1.0 (2026-11-01)

First tagged version. Not yet published to npm.

- Six deterministic engines that drive a real browser:
  - `static`: axe-core, WCAG A/AA rules
  - `keyboard`
  - `states`
  - `visual`
  - `at`: accessibility tree and announcements
  - `widgets`: ARIA Authoring Practices contracts
- Optional bring-your-own-model AI judges and keyboard and screen-reader persona agents, off by default and never above `likely`.
- Website scanning, plus repo scanning: React and Vue source lint, Storybook stories and an opt-in dev-server boot.
- The canonical Finding format, version 1, with trust tiers and evidence. Reports in JSON, SARIF and accessible HTML.
- Delivery: the `clear-a11y` CLI, an MCP server, a GitHub Action, a self-hostable API server, a desktop app and a docs site.
- A benchmark harness over seeded fixtures covering all 55 WCAG 2.2 A/AA success criteria.
