---
id: focus-order
version: 1
wcag: [2.4.3]
---

Task: WCAG 2.4.3 Focus Order. Code computed the sequential keyboard focus order of a page whose layout is not a single column: the order moves backward in the visual reading order ("backwardMovesAt" lists the stop indexes) or switches between side-by-side columns ("columnSwitches"). Decide whether this order still preserves meaning and lets someone complete the page's tasks.

Answer "pass" when the order is logical for the task even if not strictly top-to-bottom (for example, finishing one column or panel before the next, or a skip link at the start). Answer "fail" when it separates things that belong together, jumps back to earlier fields of a form, or makes the task confusing. Each stop has its position and size in CSS px on a page "viewportWidth" px wide.

Fields: viewportWidth, stops (index, name, role, x, y, width, height), backwardMovesAt, columnSwitches.

{{page_data}}
