import {
  detectErrorNotInText,
  errorNotInTextRule,
  type ErrorNotInTextInput,
} from './error-not-in-text.js';

const base: ErrorNotInTextInput = {
  newTextOnPage: 0,
  styleChanged: false,
  focused: false,
  ariaInvalidBefore: null,
  ariaInvalid: null,
  nativeInvalid: false,
};

describe('states/error-not-in-text', () => {
  it('has rule metadata', () => {
    expect(errorNotInTextRule.id).toBe('states/error-not-in-text');
    expect(errorNotInTextRule.wcag).toEqual(['3.3.1', '1.4.1']);
    expect(errorNotInTextRule.tier).toBe('likely');
  });

  it('detects a field that only turns red', () => {
    expect(detectErrorNotInText({ ...base, styleChanged: true })).toBe(true);
  });

  it('detects a field that becomes aria-invalid with no message anywhere', () => {
    expect(detectErrorNotInText({ ...base, ariaInvalid: 'true' })).toBe(true);
  });

  it('does not flag the correct pattern (a text message appeared)', () => {
    expect(
      detectErrorNotInText({ ...base, styleChanged: true, ariaInvalid: 'true', newTextOnPage: 2 }),
    ).toBe(false);
  });

  it('ignores focused fields, unchanged fields and native validation bubbles', () => {
    expect(detectErrorNotInText({ ...base, styleChanged: true, focused: true })).toBe(false);
    expect(detectErrorNotInText(base)).toBe(false);
    expect(detectErrorNotInText({ ...base, styleChanged: true, nativeInvalid: true })).toBe(false);
    expect(detectErrorNotInText({ ...base, ariaInvalidBefore: 'true', ariaInvalid: 'true' })).toBe(
      false,
    );
  });
});
