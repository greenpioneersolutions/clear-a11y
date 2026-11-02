import { detectErrorNotAssociated, errorNotAssociatedRule } from './error-not-associated.js';

describe('at/error-not-associated', () => {
  it('has rule metadata', () => {
    expect(errorNotAssociatedRule.id).toBe('at/error-not-associated');
    expect(errorNotAssociatedRule.wcag).toEqual(['3.3.1', '1.3.1']);
  });

  it('detects an error that is not in the field name or description', () => {
    expect(detectErrorNotAssociated({ errorText: 'Required', exposedText: 'Email' })).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(
      detectErrorNotAssociated({
        errorText: 'Enter your email address',
        exposedText: 'Email Enter your email address.',
      }),
    ).toBe(false);
    expect(detectErrorNotAssociated({ errorText: '  ', exposedText: 'Email' })).toBe(false);
  });
});
