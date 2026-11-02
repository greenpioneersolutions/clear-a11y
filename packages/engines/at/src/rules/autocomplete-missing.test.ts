import {
  autocompleteMissingRule,
  detectAutocompleteMissing,
  hasPurposeToken,
  inferPurpose,
  type AutocompleteInput,
} from './autocomplete-missing.js';

const field = (over: Partial<AutocompleteInput> = {}): AutocompleteInput => ({
  type: 'text',
  label: '',
  name: '',
  id: '',
  autocomplete: null,
  ...over,
});

describe('at/autocomplete-missing', () => {
  it('has rule metadata', () => {
    expect(autocompleteMissingRule.id).toBe('at/autocomplete-missing');
    expect(autocompleteMissingRule.wcag).toEqual(['1.3.5']);
    expect(autocompleteMissingRule.tier).toBe('likely');
  });

  it('infers purposes from labels, types and names', () => {
    expect(inferPurpose(field({ label: 'Full name' }))).toBe('name');
    expect(inferPurpose(field({ label: 'First name *' }))).toBe('given-name');
    expect(inferPurpose(field({ label: 'Surname' }))).toBe('family-name');
    expect(inferPurpose(field({ type: 'email', label: 'Where should we write?' }))).toBe('email');
    expect(inferPurpose(field({ label: 'Phone number' }))).toBe('tel');
    expect(inferPurpose(field({ label: 'Postcode' }))).toBe('postal-code');
    expect(inferPurpose(field({ label: 'Name on card' }))).toBe('cc-name');
    expect(inferPurpose(field({ label: 'Card number' }))).toBe('cc-number');
    expect(inferPurpose(field({ label: 'Street address' }))).toBe('street-address');
    expect(inferPurpose(field({ name: 'zip' }))).toBe('postal-code');
    expect(inferPurpose(field({ label: 'Company name' }))).toBe('organization');
  });

  it('ignores fields that are not about the user or have no known purpose', () => {
    expect(inferPurpose(field({ label: "Recipient's name" }))).toBeUndefined();
    expect(inferPurpose(field({ label: 'Gift message' }))).toBeUndefined();
    expect(inferPurpose(field({ label: 'Search products' }))).toBeUndefined();
    expect(inferPurpose(field({ label: 'Product name' }))).toBeUndefined();
    expect(inferPurpose(field({ label: 'Quantity' }))).toBeUndefined();
  });

  it('detects personal data fields without a purpose token', () => {
    expect(detectAutocompleteMissing(field({ label: 'Email', type: 'email' }))).toBe('email');
    expect(detectAutocompleteMissing(field({ label: 'Email', autocomplete: 'off' }))).toBe('email');
    expect(detectAutocompleteMissing(field({ label: 'Email', autocomplete: 'on' }))).toBe('email');
  });

  it('does not flag the correct pattern', () => {
    expect(detectAutocompleteMissing(field({ label: 'Email', autocomplete: 'email' }))).toBe(
      undefined,
    );
    expect(
      detectAutocompleteMissing(field({ label: 'Postcode', autocomplete: 'shipping postal-code' })),
    ).toBeUndefined();
    // An invalid token is axe's autocomplete-valid finding; not reported twice.
    expect(detectAutocompleteMissing(field({ label: 'Email', autocomplete: 'mail' }))).toBe(
      undefined,
    );
    expect(hasPurposeToken('section-a billing tel webauthn')).toBe(true);
    expect(hasPurposeToken('nope')).toBe(false);
  });
});
