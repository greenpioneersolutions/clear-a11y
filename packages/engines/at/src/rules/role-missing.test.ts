import { detectRoleMissing, roleMissingRule } from './role-missing.js';

const base = { axRole: 'generic', tabIndex: 0, nativeControl: false, listenerTypes: ['click'] };

describe('at/role-missing', () => {
  it('has rule metadata', () => {
    expect(roleMissingRule.id).toBe('at/role-missing');
    expect(roleMissingRule.wcag).toEqual(['4.1.2']);
    expect(roleMissingRule.tier).toBe('likely');
  });

  it('detects a focusable div with a click handler and no role', () => {
    expect(detectRoleMissing(base)).toBe(true);
    expect(detectRoleMissing({ ...base, axRole: 'listitem', listenerTypes: ['pointerdown'] })).toBe(
      true,
    );
  });

  it('does not flag the correct pattern', () => {
    expect(detectRoleMissing({ ...base, axRole: 'button' })).toBe(false);
    expect(detectRoleMissing({ ...base, nativeControl: true })).toBe(false);
  });

  it('ignores elements outside the Tab order and key-only handlers (scroll regions)', () => {
    expect(detectRoleMissing({ ...base, tabIndex: -1 })).toBe(false);
    expect(detectRoleMissing({ ...base, listenerTypes: ['keydown'] })).toBe(false);
  });
});
