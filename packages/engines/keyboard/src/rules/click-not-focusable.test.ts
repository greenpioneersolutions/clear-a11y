import {
  classifyClickCandidate,
  clickNotFocusableRule,
  type ClickCandidate,
} from './click-not-focusable.js';

const div: ClickCandidate = {
  hasListener: false,
  hasOnclick: true,
  pointerCursor: true,
  focusableNearby: false,
  visible: true,
};

describe('keyboard/click-not-focusable', () => {
  it('has rule metadata', () => {
    expect(clickNotFocusableRule.id).toBe('keyboard/click-not-focusable');
    expect(clickNotFocusableRule.wcag).toEqual(['2.1.1']);
  });

  it('detects the barrier: a div with a click handler', () => {
    expect(classifyClickCandidate(div)).toBe('likely');
    expect(classifyClickCandidate({ ...div, hasOnclick: false, hasListener: true })).toBe('likely');
  });

  it('asks for review when only the cursor suggests a control', () => {
    expect(classifyClickCandidate({ ...div, hasOnclick: false })).toBe('needs-review');
  });

  it('does not flag the correct pattern (a button) or hidden elements', () => {
    expect(classifyClickCandidate({ ...div, focusableNearby: true })).toBeNull();
    expect(classifyClickCandidate({ ...div, visible: false })).toBeNull();
    expect(classifyClickCandidate({ ...div, hasOnclick: false, pointerCursor: false })).toBeNull();
  });
});
