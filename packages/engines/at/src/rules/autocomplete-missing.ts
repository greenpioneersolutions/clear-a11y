import type { RuleMeta } from '@clear-a11y/core';

export const autocompleteMissingRule: RuleMeta = {
  id: 'at/autocomplete-missing',
  engine: 'engine-at',
  wcag: ['1.3.5'],
  tier: 'likely',
  title: 'Personal data field without an autocomplete token',
  description:
    'A field that asks for the user\'s own name, email, phone, address, birthday or card details has no autocomplete token that names its purpose (missing, "on" or "off"). Browsers and assistive tools cannot fill it in or add familiar icons, so people with memory, motor or cognitive disabilities must type everything by hand.',
  fix: 'Add the matching HTML autofill token, for example autocomplete="email", "given-name", "tel", "postal-code" or "cc-number".',
};

/** Autofill field names from the HTML standard (the last token of a valid autocomplete value). */
export const AUTOFILL_FIELDS = new Set([
  'name',
  'honorific-prefix',
  'given-name',
  'additional-name',
  'family-name',
  'honorific-suffix',
  'nickname',
  'username',
  'new-password',
  'current-password',
  'one-time-code',
  'organization-title',
  'organization',
  'street-address',
  'address-line1',
  'address-line2',
  'address-line3',
  'address-level4',
  'address-level3',
  'address-level2',
  'address-level1',
  'country',
  'country-name',
  'postal-code',
  'cc-name',
  'cc-given-name',
  'cc-additional-name',
  'cc-family-name',
  'cc-number',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'cc-csc',
  'cc-type',
  'transaction-currency',
  'transaction-amount',
  'language',
  'bday',
  'bday-day',
  'bday-month',
  'bday-year',
  'sex',
  'url',
  'photo',
  'tel',
  'tel-country-code',
  'tel-national',
  'tel-area-code',
  'tel-local',
  'tel-local-prefix',
  'tel-local-suffix',
  'tel-extension',
  'email',
  'impp',
]);

export interface AutocompleteInput {
  /** Lower-case element type: "text", "email", "tel", "select", "textarea"... */
  type: string;
  /** The field's accessible label text (label, aria-label/labelledby, placeholder). */
  label: string;
  /** `name` and `id` attributes. */
  name: string;
  id: string;
  /** The autocomplete attribute, or null when absent. */
  autocomplete: string | null;
}

/** Purposes, most specific first. Each pattern is tested against the label, then name/id. */
const PURPOSES: Array<[token: string, label: RegExp, attr: RegExp]> = [
  ['cc-name', /\bname on (the )?card\b|\bcard ?holder\b/, /\bcc-?name\b|card_?holder/],
  ['cc-number', /\bcard number\b|\bcredit card\b/, /\bcc-?num|card_?number|cardnumber/],
  ['cc-exp', /\bexpir(y|ation)\b|\bmm ?\/ ?yy\b/, /\bcc-?exp|expir/],
  ['cc-csc', /\b(cvc|cvv|csc|security code)\b/, /\b(cvc|cvv|csc)\b/],
  ['email', /\be-?mail\b/, /\be-?mail\b/],
  ['tel', /\b(phone|telephone|mobile)( number)?\b/, /\b(phone|tel|telephone|mobile)\b/],
  ['given-name', /\b(first|given) name\b|\bforename\b/, /\b(first|given)[-_ ]?name\b|\bfname\b/],
  [
    'family-name',
    /\b(last|family) name\b|\bsurname\b/,
    /\b(last|family)[-_ ]?name\b|\blname\b|\bsurname\b/,
  ],
  ['username', /\buser ?name\b/, /\buser[-_ ]?name\b/],
  ['organization', /\b(company|organi[sz]ation)( name)?\b/, /\b(company|organi[sz]ation)\b/],
  [
    'address-line2',
    /\baddress line 2\b|\b(apartment|suite|flat)\b/,
    /\baddress[-_ ]?(line)?[-_ ]?2\b/,
  ],
  [
    'street-address',
    /\b(street )?address( line 1)?\b|\bstreet\b/,
    /\b(street|address)([-_ ]?(line)?[-_ ]?1)?\b/,
  ],
  ['address-level2', /\b(city|town)\b/, /\b(city|town)\b/],
  [
    'postal-code',
    /\bpost ?code\b|\bpostal code\b|\bzip( code)?\b/,
    /\b(post[-_ ]?code|postal|zip)\b/,
  ],
  ['country', /\bcountry\b/, /\bcountry\b/],
  ['bday', /\bdate of birth\b|\bbirthday\b|\bbirth date\b/, /\b(dob|bday|birth[-_ ]?date)\b/],
  ['name', /^(your |full )?name\b/, /^(full[-_ ]?)?name$/],
];

/** Fields about someone else (a gift recipient, a friend) are outside 1.3.5. */
const ABOUT_SOMEONE_ELSE = /\b(recipient|friend|their|gift|colleague|referr)/;

const clean = (s: string) => s.toLowerCase().replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim();

/** The autofill purpose a human auditor would infer from the field, if any. */
export function inferPurpose(input: Omit<AutocompleteInput, 'autocomplete'>): string | undefined {
  const label = clean(input.label);
  const attrs = [input.name, input.id].map((s) => s.toLowerCase());
  if (ABOUT_SOMEONE_ELSE.test(label)) return undefined;
  if (input.type === 'email') return 'email';
  if (input.type === 'tel') return 'tel';
  for (const [token, byLabel, byAttr] of PURPOSES) {
    if (label ? byLabel.test(label) : attrs.some((a) => byAttr.test(a))) return token;
  }
  return undefined;
}

/** True when the value names a purpose (an autofill field name as its last token). */
export function hasPurposeToken(autocomplete: string | null): boolean {
  const tokens = (autocomplete ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const field = tokens.filter((t) => t !== 'webauthn').pop();
  return field !== undefined && AUTOFILL_FIELDS.has(field);
}

/** An invalid token (not empty, on or off) is axe's `autocomplete-valid`; not reported twice. */
const isUnsetOrGeneric = (autocomplete: string | null) =>
  ['', 'on', 'off'].includes((autocomplete ?? '').toLowerCase().trim());

/**
 * Pure analysis for at/autocomplete-missing: returns the expected token when the field collects
 * personal data and its autocomplete attribute is missing, "on" or "off".
 */
export function detectAutocompleteMissing(input: AutocompleteInput): string | undefined {
  if (hasPurposeToken(input.autocomplete) || !isUnsetOrGeneric(input.autocomplete))
    return undefined;
  return inferPurpose(input);
}
