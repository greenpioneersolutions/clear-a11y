---
id: states/context-change-on-input
title: Changing a form control causes a change of context
engine: engine-states
wcag: [3.2.2]
tier: likely
---

# Changing a form control causes a change of context

**Rule:** `states/context-change-on-input` · **WCAG:** 3.2.2 · **Tier:** `likely` / `needs-review` · **Engine:** `engine-states`

## What it catches

Changing the value of a form control, without pressing any submit button, changes the context:

- the form is submitted;
- another page loads (also a reload, or a new URL through the history API);
- a new window opens;
- a modal dialog opens;
- focus jumps to another element (for example "auto-tab" when a short field is full);
- most of the page is replaced (`needs-review`: it can be a legitimate filter).

The classic example is a "jump menu": a country or language list that loads a page as soon as an option is chosen.

## Who it affects

Keyboard users change a `<select>` with the arrow keys, and every arrow press is a change, so they are sent to the first option they pass. Screen reader users and people with cognitive disabilities often change a value just to explore the options and don't expect to be taken somewhere else. Moved focus makes people lose their place.

## How it's measured

The state explorer collects visible, enabled form controls in DOM order (`states.maxInputs`, 10 by default): single selects, checkboxes, one unchecked radio button per group and text-like inputs. For each, on a freshly loaded page, it:

1. focuses the control and changes it: chooses another option, clicks the checkbox or radio button, or types a value (a field with a short `maxlength` is filled to its maximum, because auto-submit and auto-tab usually trigger there), then leaves a text field so `change` fires;
2. records submit events and `form.submit()` calls, main-frame navigations, `window.open()` calls and popups, modal dialogs that appeared, where focus went, and how much of the page stopped being visible.

It never presses a submit button. The [route guard](../../../packages/engines/states/README.md#safety-model) stays installed: non-GET requests are aborted and navigations to another document are answered locally with `204 No Content`, so nothing reaches the server and the browser stays on the page. `window.open()` is answered with `null`, so no window opens. Controls and options whose name looks destructive (`delete`, `pay`, `sign out`, ...) are skipped.

**Tier.** The change itself is observed, but SC 3.2.2 allows it when users were advised before using the control, and the engine can't be sure it saw every warning. So findings are `likely`, and `needs-review` (with a yes/no question) when text near the control (its label, hint, `aria-describedby` text, fieldset legend, or its form) may announce the behaviour, such as "updates automatically", "opens in a new window" or "the page reloads when you choose". Most of the page being replaced is always `needs-review`.

Changes made only to the URL fragment (`#section`) and content that changes in place (a filtered list, a revealed hint) are not reported.

## How to fix

Start the change of context with an explicit button, or tell people before the control what will happen.

```html
<!-- Before: choosing an option loads another page -->
<select id="country" onchange="location.href = '?country=' + this.value">
  ...
</select>

<!-- After: nothing happens until the user presses Go -->
<form action="/stores" method="get">
  <label for="country">Country</label>
  <select id="country" name="country">
    ...
  </select>
  <button type="submit">Go</button>
</form>
```

## WCAG

[SC 3.2.2 On Input](https://www.w3.org/WAI/WCAG22/Understanding/on-input.html) (A): "Changing the setting of any user interface component does not automatically cause a change of context unless the user has been advised of the behavior before using the component." Related failures: [F36](https://www.w3.org/WAI/WCAG22/Techniques/failures/F36) (submitting a form automatically when the last field gets a value) and [F37](https://www.w3.org/WAI/WCAG22/Techniques/failures/F37) (opening a new window when a radio button, checkbox or select changes). Sufficient techniques include [G80](https://www.w3.org/WAI/WCAG22/Techniques/general/G80) (a submit button starts the change) and [G13](https://www.w3.org/WAI/WCAG22/Techniques/general/G13) (describing what will happen before the change).

## Examples

- Barrier: [`fixtures/site/states/context-change-on-input.html`](../../../fixtures/site/states/context-change-on-input.html) (choosing a country loads its page)
- Correct pattern: [`fixtures/site/states/context-change-on-input-ok.html`](../../../fixtures/site/states/context-change-on-input-ok.html) (a Go button; filters change content in place)
