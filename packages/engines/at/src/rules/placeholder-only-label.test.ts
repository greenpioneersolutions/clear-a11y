import { detectPlaceholderOnlyLabel, placeholderOnlyLabelRule } from './placeholder-only-label.js';

describe('at/placeholder-only-label', () => {
  it('has rule metadata', () => {
    expect(placeholderOnlyLabelRule.id).toBe('at/placeholder-only-label');
    expect(placeholderOnlyLabelRule.wcag).toEqual(['3.3.2', '1.3.1', '4.1.2']);
  });

  it('detects a text field named only by its placeholder', () => {
    expect(detectPlaceholderOnlyLabel({ role: 'textbox', nameSource: 'placeholder' })).toBe(true);
    expect(detectPlaceholderOnlyLabel({ role: 'searchbox', nameSource: 'placeholder' })).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(detectPlaceholderOnlyLabel({ role: 'textbox', nameSource: 'label' })).toBe(false);
    expect(detectPlaceholderOnlyLabel({ role: 'textbox', nameSource: 'aria-labelledby' })).toBe(
      false,
    );
    expect(detectPlaceholderOnlyLabel({ role: 'button', nameSource: 'placeholder' })).toBe(false);
  });
});
