---
id: label-in-name
version: 1
wcag: [2.5.3]
---

Task: WCAG 2.5.3 Label in Name. A control shows a visible label but its accessible name comes from aria-label or aria-labelledby. Decide whether a speech-input user who says the visible label would match the accessible name.

Answer "pass" when the accessible name contains the visible label's words in the same order (ideally at the start), or when the visible label is a symbol whose usual spoken form ("close" for "×", "plus" or "add" for "+", "next" for "→") is in the name. Answer "fail" when the visible words are missing from the name, reordered, abbreviated differently, or replaced by a synonym. Ignore letter case and punctuation.

Fields: role, visibleLabel (text shown on screen), accessibleName, nameSource.

{{page_data}}
