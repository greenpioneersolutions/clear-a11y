import { detectStateMissing, stateMissingRule } from './state-missing.js';

describe('at/state-missing', () => {
  it('has rule metadata', () => {
    expect(stateMissingRule.id).toBe('at/state-missing');
    expect(stateMissingRule.wcag).toEqual(['4.1.2']);
  });

  it('detects a tablist where no tab is selected', () => {
    const group = [{ 'aria-selected': null }, { 'aria-selected': null }];
    expect(detectStateMissing({ role: 'tab', attributes: group[0]!, group })).toBe('aria-selected');
    const allFalse = [{ 'aria-selected': 'false' }, { 'aria-selected': 'false' }];
    expect(detectStateMissing({ role: 'tab', attributes: allFalse[0]!, group: allFalse })).toBe(
      'aria-selected',
    );
  });

  it('does not flag the correct pattern', () => {
    const group = [{ 'aria-selected': 'true' }, { 'aria-selected': null }];
    expect(detectStateMissing({ role: 'tab', attributes: group[1]!, group })).toBeUndefined();
  });

  it('applies the required-state table to single widgets', () => {
    expect(detectStateMissing({ role: 'checkbox', attributes: { 'aria-checked': null } })).toBe(
      'aria-checked',
    );
    expect(
      detectStateMissing({ role: 'checkbox', attributes: { 'aria-checked': 'mixed' } }),
    ).toBeUndefined();
    expect(detectStateMissing({ role: 'button', attributes: {} })).toBeUndefined();
  });
});
