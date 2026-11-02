---
id: states/expanded-state-mismatch
title: aria-expanded does not match the content
engine: engine-states
wcag: [4.1.2]
tier: violation
---

# aria-expanded does not match the content

**Rule:** `states/expanded-state-mismatch` · **WCAG:** 4.1.2 · **Tier:** `violation` (or `likely`, see below) · **Engine:** `engine-states`

## What it catches

For every visible control with `aria-expanded="false"`, the states engine loads the page fresh, activates the control and checks what happened:

- The content opened but the control still says `aria-expanded="false"`, or
- activating it again hid the content but the control still says `aria-expanded="true"`.

When the control names its content with `aria-controls`, the engine checks that exact element's visibility, so the finding is a `violation`. Without `aria-controls` it can only see that _some_ content appeared, so the finding is `likely`.

Controls that don't use `aria-expanded` at all are not this rule's job: a toggle that never exposes its state is reported by the accessibility-tree layer.

WCAG reference: [Understanding SC 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) requires that states of user interface components can be programmatically determined and that changes to them are available to assistive technology. See also the [ARIA Authoring Practices accordion](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) and [disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) patterns.

## Who it affects

Screen reader users hear "collapsed" while the content is open (or "expanded" while it is closed). They may think the button is broken, activate it again and close the content they wanted, or miss the content entirely.

## How to fix

Update `aria-expanded` in the same code that shows or hides the content:

```js
button.addEventListener('click', () => {
  const open = panel.hidden;
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
});
```

## Examples

- Barrier: [`fixtures/site/states/expanded-state-mismatch.html`](../../../fixtures/site/states/expanded-state-mismatch.html)
- Correct pattern: [`fixtures/site/states/expanded-state-mismatch-ok.html`](../../../fixtures/site/states/expanded-state-mismatch-ok.html)
