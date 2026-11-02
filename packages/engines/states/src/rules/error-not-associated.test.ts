import { detectErrorNotAssociated, errorNotAssociatedRule } from './error-not-associated.js';

describe('states/error-not-associated', () => {
  it('has rule metadata', () => {
    expect(errorNotAssociatedRule.id).toBe('states/error-not-associated');
    expect(errorNotAssociatedRule.wcag).toEqual(['3.3.1', '1.3.1']);
  });

  it('is a violation when visible error text is not tied to the field at all', () => {
    expect(
      detectErrorNotAssociated({
        ariaInvalid: null,
        texts: [{ text: 'Required', associated: false }],
      }),
    ).toBe('violation');
  });

  it('is likely when the field is marked invalid but the message is not linked', () => {
    expect(
      detectErrorNotAssociated({
        ariaInvalid: 'true',
        texts: [{ text: 'Required', associated: false }],
      }),
    ).toBe('likely');
  });

  it('does not flag the correct pattern (message linked with aria-describedby)', () => {
    expect(
      detectErrorNotAssociated({
        ariaInvalid: 'true',
        texts: [{ text: 'Enter your email address', associated: true }],
      }),
    ).toBeUndefined();
  });

  it('does not flag fields where no text appeared', () => {
    expect(detectErrorNotAssociated({ ariaInvalid: null, texts: [] })).toBeUndefined();
    expect(
      detectErrorNotAssociated({ ariaInvalid: null, texts: [{ text: '  ', associated: false }] }),
    ).toBeUndefined();
  });
});
