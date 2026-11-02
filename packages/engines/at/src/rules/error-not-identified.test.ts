import { detectErrorNotIdentified, errorNotIdentifiedRule } from './error-not-identified.js';

const field = {
  selector: '#email',
  invalidBefore: false,
  invalidAfter: false,
  styleChanged: false,
};

describe('at/error-not-identified', () => {
  it('has rule metadata', () => {
    expect(errorNotIdentifiedRule.id).toBe('at/error-not-identified');
    expect(errorNotIdentifiedRule.wcag).toEqual(['3.3.1']);
    expect(errorNotIdentifiedRule.tier).toBe('violation');
  });

  it('detects fields marked invalid only visually or only with aria-invalid', () => {
    expect(
      detectErrorNotIdentified({ fields: [{ ...field, styleChanged: true }], newText: false }),
    ).toHaveLength(1);
    expect(
      detectErrorNotIdentified({ fields: [{ ...field, invalidAfter: true }], newText: false }),
    ).toHaveLength(1);
  });

  it('does not flag the correct pattern (an error text appeared)', () => {
    expect(
      detectErrorNotIdentified({ fields: [{ ...field, styleChanged: true }], newText: true }),
    ).toEqual([]);
    expect(
      detectErrorNotIdentified({
        fields: [{ ...field, invalidAfter: true }],
        newText: false,
        describedChange: true,
      }),
    ).toEqual([]);
  });

  it('ignores fields that did not change', () => {
    expect(
      detectErrorNotIdentified({
        fields: [field, { ...field, invalidBefore: true, invalidAfter: true }],
        newText: false,
      }),
    ).toEqual([]);
  });
});
