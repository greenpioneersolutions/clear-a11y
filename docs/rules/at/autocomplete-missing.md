---
id: at/autocomplete-missing
title: Personal data field without an autocomplete token
engine: engine-at
wcag: [1.3.5]
tier: likely
---

# Personal data field without an autocomplete token

**Rule:** `at/autocomplete-missing` · **WCAG:** 1.3.5 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

A visible, editable text field, select or textarea that asks for the user's own data, with no autocomplete token naming its purpose (the attribute is missing, empty, `on` or `off`, on the field or inherited from its form). The purpose is inferred from the field's label (or `aria-label`, `aria-labelledby`, placeholder or title), its type (`email`, `tel`) and, when there is no label, its `name`/`id`: name, given and family name, email, phone, street address, address line 2, town or city, postcode, country, organisation, username, birthday and card details.

Fields inside a search landmark, custom comboboxes (`role="combobox"` or `aria-autocomplete`, which switch browser autofill off so it doesn't fight their own suggestion list), and fields about someone else (labels mentioning a recipient, friend, gift or colleague), are skipped. A field with an invalid token is left to `engine-static` (axe-core `autocomplete-valid`).

## Who it affects

- People with memory, language or cognitive disabilities, who struggle to recall and type the same details on every site.
- People with motor disabilities, for whom typing is slow or painful.
- Users of tools that add familiar icons to fields based on their purpose.

## Tier

`likely`. The purpose comes from reading the label, which is reliable for common fields but can be wrong (a "Name" field may be a project name). See [Understanding 1.3.5 Identify Input Purpose](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html).

## How to fix

Add the matching token from the HTML autofill list:

```html
<label for="email">Email address</label>
<input id="email" type="email" autocomplete="email" />
<label for="postcode">Postcode</label>
<input id="postcode" autocomplete="shipping postal-code" />
```

## Examples

- Barrier: [`fixtures/site/wcag/1-3-5-input-purpose.html`](../../../fixtures/site/wcag/1-3-5-input-purpose.html)
- Correct pattern: [`fixtures/site/wcag/1-3-5-input-purpose-ok.html`](../../../fixtures/site/wcag/1-3-5-input-purpose-ok.html)
