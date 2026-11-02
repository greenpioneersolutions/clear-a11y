import type { FocusChange } from '../lib/pixels.js';
import { classifyFocusIndicator, focusNotVisibleRule } from './focus-not-visible.js';

const change = (changed: number, strong: number, maxContrast = 1): FocusChange => ({
  total: 1000,
  changed,
  ratio: changed / 1000,
  bbox: null,
  strong,
  maxContrast,
});

describe('keyboard/focus-not-visible', () => {
  it('has rule metadata', () => {
    expect(focusNotVisibleRule.id).toBe('keyboard/focus-not-visible');
    expect(focusNotVisibleRule.wcag).toEqual(['2.4.7']);
  });

  it('detects the barrier: no pixel changes on focus', () => {
    expect(classifyFocusIndicator(change(0, 0), 24)).toBe('none');
  });

  it('asks for review when the change is faint (1px light-gray outline)', () => {
    expect(classifyFocusIndicator(change(140, 0, 1.4), 24)).toBe('weak');
  });

  it('asks for review when the change is tiny', () => {
    expect(classifyFocusIndicator(change(4, 4, 8), 24)).toBe('weak');
  });

  it('does not flag the correct pattern (3px outline with strong contrast)', () => {
    expect(classifyFocusIndicator(change(600, 560, 6.3), 24)).toBe('visible');
  });
});
