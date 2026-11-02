# @clear-a11y/engine-visual

Measures what low-vision and mobile users see: reflow, text resize, text spacing, real-pixel contrast, target size, content on hover or focus, orientation locks, and moving content without a pause control. Results come from rendered geometry and pixels in a real browser, not from guesses based on markup.

Part of [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). Engines are run by `@clear-a11y/runner`; you rarely use them directly.

## Install

```sh
pnpm add @clear-a11y/engine-visual
```

## Usage

```ts
import { createVisualEngine } from '@clear-a11y/engine-visual';

const engine = createVisualEngine();
const findings = await engine.run(pageContext); // PageContext from @clear-a11y/browser
```

The engine changes the viewport, injects styles and moves the mouse, so it keeps the default `mutatesPage` (the runner gives it a fresh page load). Every check restores what it changed. The motion check (2.2.2) watches the page for a few seconds on a second page of the same browser context, with `prefers-reduced-motion: no-preference` and then `reduce`, in parallel with the other checks; it closes that page when it is done.

## Rules

| Rule                                   | WCAG          | Tier                                    | Measures                                                          |
| -------------------------------------- | ------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `visual/reflow-horizontal-scroll`      | 1.4.10        | violation                               | Page scrolls sideways at 320 × 256 CSS px; reports root causes    |
| `visual/reflow-two-dimensional`        | 1.4.10        | needs-review                            | Sideways-scrolling regions that aren't tables, code, maps, media  |
| `visual/text-resize-clipped`           | 1.4.4         | violation (zoom) / likely (text-only)   | Text cut off at the 200% zoom layout or with font sizes doubled   |
| `visual/text-spacing-clipped`          | 1.4.12        | violation (clipped) / likely (overlap)  | Text cut off or overlapping with the WCAG text-spacing overrides  |
| `visual/text-overlap`                  | 1.4.4, 1.4.10 | likely                                  | Text running into other text or controls after resize or reflow   |
| `visual/contrast-over-background`      | 1.4.3         | violation (median) / likely (worst 10%) | Real-pixel contrast of text over images, gradients, overlaps      |
| `visual/non-text-contrast`             | 1.4.11        | likely                                  | Border, fill and icon contrast of fields and icon-only buttons    |
| `visual/target-size`                   | 2.5.8         | violation                               | Targets under 24 × 24 CSS px failing the 24px circle test         |
| `visual/hover-content-not-dismissible` | 1.4.13        | violation                               | Covering hover/focus content that Escape doesn't close            |
| `visual/hover-content-not-hoverable`   | 1.4.13        | likely                                  | Hover content that vanishes when the pointer moves onto it        |
| `visual/hover-content-not-persistent`  | 1.4.13        | likely                                  | Hover/focus content that hides itself                             |
| `visual/motion-without-pause`          | 2.2.2         | likely / needs-review                   | Content moving or updating for 5+ s with no working pause control |
| `visual/orientation-locked`            | 1.3.4         | violation (rotate message) / likely     | Content hidden or turned in portrait or landscape                 |

Each rule has a page in [`docs/rules/visual/`](../../../docs/rules/visual/) with the measurement method and its limits. Plain solid-color text contrast is left to axe-core in `@clear-a11y/engine-static`, so findings are never duplicated.

## Configuration

Options live under `visual` in the Clear A11Y config. All are optional.

```json
{
  "visual": {
    "reflow": true,
    "textResize": true,
    "textSpacing": true,
    "contrast": true,
    "nonTextContrast": true,
    "targetSize": true,
    "hover": true,
    "motion": true,
    "orientation": true,
    "motionObserveMs": 2100,
    "motionCarouselObserveMs": 5500,
    "maxContrastCandidates": 40,
    "maxNonTextCandidates": 40,
    "maxHoverTriggers": 6,
    "hoverPersistMs": 1000,
    "targetSizeEquivalent": ["#pager-compact a"]
  }
}
```

`targetSizeEquivalent` lists small targets that have a large-enough equivalent elsewhere on the page; their target-size findings become `needs-review`. Slow checks (contrast, hover) stop early when the runner's per-state time budget is nearly used up.

The pure measurement helpers are exported for reuse and testing: `contrastRatio`, `relativeLuminance`, `isLargeText`, `failsSpacing`, `overlappingPairs`, `newlyClipped`, `glyphContrast`, `decodePng` and more.

## Development

```sh
pnpm nx test @clear-a11y/engine-visual              # unit tests (no browser)
pnpm nx test-integration @clear-a11y/engine-visual  # Playwright against fixtures/
```

Add a rule with `pnpm nx g @clear-a11y/workspace-plugin:rule --engine=visual --name=<rule-name> --wcag=<sc>`.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (rules reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/engines/visual
