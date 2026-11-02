---
id: color-only
version: 1
wcag: [1.4.1]
---

Task: WCAG 1.4.1 Use of Color. Code found an element whose meaning may be shown only by color: a link inside running text with no underline or other visual cue ("inline-link"), a form label marked by color ("required-label"), or a status dot, chip or badge without text ("status-indicator"). Decide whether the information is also available without perceiving color.

For an inline link: answer "fail" when nothing but color separates it from the surrounding text and the colors differ by less than 3:1 ("contrastWithComparedColor"); when the contrast is 3:1 or more, answer "uncertain" unless the context makes the link obvious, because WCAG then also needs a non-color cue on hover and focus, which code could not see here. For a label: answer "fail" when "required" (or another state) is shown only by its color. For a status indicator: answer "fail" when its meaning is only its color and it has no accessible name or nearby text that states it. "nonColorCues" lists the cues code found (empty here).

Fields: kind, text, color, comparedWith, contrastWithComparedColor, background, nonColorCues, context.

{{page_data}}
