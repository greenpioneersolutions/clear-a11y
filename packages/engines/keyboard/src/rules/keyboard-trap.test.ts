import { detectKeyboardTrap, keyboardTrapRule, type KeyboardTrapInput } from './keyboard-trap.js';

const trapped: KeyboardTrapInput = {
  cycleSize: 1,
  tabbableCount: 3,
  escapedBackward: false,
  escapedAfterEscape: false,
  modalWithCloseControl: false,
};

describe('keyboard/keyboard-trap', () => {
  it('has rule metadata', () => {
    expect(keyboardTrapRule.id).toBe('keyboard/keyboard-trap');
    expect(keyboardTrapRule.wcag).toEqual(['2.1.2']);
  });

  it('detects the barrier: an editor that swallows Tab, Shift+Tab and Escape', () => {
    expect(detectKeyboardTrap(trapped)).toBe(true);
  });

  it('does not flag a component with a documented Escape-then-Tab exit', () => {
    expect(detectKeyboardTrap({ ...trapped, escapedAfterEscape: true })).toBe(false);
  });

  it('does not flag a component Shift+Tab can leave', () => {
    expect(detectKeyboardTrap({ ...trapped, escapedBackward: true })).toBe(false);
  });

  it('does not flag an open modal dialog with a close control', () => {
    expect(detectKeyboardTrap({ ...trapped, cycleSize: 2, modalWithCloseControl: true })).toBe(
      false,
    );
  });

  it('does not flag a cycle that covers every tabbable element', () => {
    expect(detectKeyboardTrap({ ...trapped, cycleSize: 3, tabbableCount: 3 })).toBe(false);
  });
});
