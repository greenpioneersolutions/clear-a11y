---
id: ai/judges
title: AI judges
engine: ai-judges
---

# AI judges

**Package:** `@clear-a11y/ai` · **Engines:** `ai-<judge>` · **Tiers:** `likely` or `needs-review`, never `violation` · **Off by default** (provider `none`)

The AI judges answer the questions a human auditor answers by reading, not measuring. Each judge works the same way:

1. **Deterministic candidate selection.** Code reads the live page (read-only) and picks the few elements worth asking about, most suspicious first, capped per judge (`ai.maxCandidatesPerJudge`) and per page (`ai.maxCallsPerPage`). Clear cases code can decide on its own are not sent: they are deterministic rules elsewhere (for example `at/alt-text-suspicious`, `at/link-text-generic`, `at/label-in-name`).
2. **One narrow question per candidate**, from a versioned prompt file (`packages/ai/prompts/<judge>.v1.md`) plus the shared system prompt. Page data goes only inside a delimited `<page_data>` block.
3. **A schema-validated verdict**: `{ verdict: pass | fail | uncertain, confidence, reason, suggestion? }`.
4. **Mapping**: `fail` with confidence ≥ `ai.likelyThreshold` (0.7) → `likely`; lower-confidence `fail`, `uncertain` and invalid output → `needs-review` with a yes/no question; `pass` → nothing. Candidate text that looks like instructions to an AI is always at least `needs-review`.

Every finding carries the judge, prompt version, provider, model, verdict and reason in `evidence.data`, an HTML snippet, and (for `likely`) a screenshot crop.

| Rule                             | WCAG  | Candidates                                                                                                                                                                                                 | Runs in             |
| -------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `ai/alt-text`                    | 1.1.1 | Visible `img` with non-empty alt, `input type=image`, `role=img` with `aria-label`. Sends alt, file name, size, link text, caption, nearby text, heading and an image crop.                                | default state       |
| `ai/label-in-name`               | 2.5.3 | Controls named by `aria-label`/`aria-labelledby` whose visible label is a symbol ("×", "→") or only partly overlaps the name ("Qty 2" vs "Quantity 2").                                                    | default state       |
| `ai/link-purpose`                | 2.4.4 | Links with generic text, URL text, one- or two-character text, or the same text as a link to another place. Sends the paragraph/list item, heading, description and destination path.                      | default state       |
| `ai/descriptive-headings-labels` | 2.4.6 | Headings, labels and legends that are vague ("Info", "Details"), numeric, one word, or duplicated. Sends following content and the other headings.                                                         | default state       |
| `ai/error-clarity`               | 3.3.3 | Messages tied to `aria-invalid` fields (`aria-errormessage`, `aria-describedby`), alerts and error-looking elements. Sends the field label, type and constraints (pattern, length, min/max), never values. | `form-invalid` only |
| `ai/color-only`                  | 1.4.1 | Inline links with no underline/border/weight/icon cue; labels marked only by color; status dots, chips and badges with no text or name. Sends colors and their contrast.                                   | default state       |
| `ai/focus-order`                 | 2.4.3 | The sequential focus order (tabindex, then DOM order) when it moves backward in reading order or switches between columns. Sends stop names, roles and positions; the finding carries the focus path.      | default state       |

## Who they help

Screen reader users (alt text, link purpose, headings, error messages, focus order), speech-input users (label in name), people with color vision deficiencies (color-only) and people with cognitive disabilities (error messages, headings).

## Why never `violation`

These are judgment calls. W3C's Understanding documents describe them in terms of purpose and meaning ([1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html), [2.4.4](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html), [2.4.6](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html), [3.3.3](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html), [1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), [2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)). A model can be wrong, so AI findings never fail CI on their own: the runner caps every `ai-*` finding at `likely` unless a deterministic engine reports the same violation on the same element.

## How to fix

Each finding's `fix` carries the model's concrete suggestion (better alt text, link text, label or message) followed by the judge's general advice.

## Configure

See [`docs/providers.md`](../../providers.md) and the options table in [`packages/ai/README.md`](../../../packages/ai/README.md).

## Measuring

The benchmark runs with provider `none`, so its numbers never include AI. Judges are tested with synthetic recorded responses (`packages/test-utils/recordings/ai/`), which prove the plumbing, not model quality. Real AI recall must be measured with a real provider and reported with the provider and model named.

## Examples

- [`fixtures/site/ai/alt-filename.html`](../../../fixtures/site/ai/alt-filename.html), [`fixtures/site/ai/link-purpose.html`](../../../fixtures/site/ai/link-purpose.html), [`fixtures/site/ai/prompt-injection.html`](../../../fixtures/site/ai/prompt-injection.html)
- Correct pattern: [`fixtures/site/ai/ok.html`](../../../fixtures/site/ai/ok.html)
