import {
  detectEscapeDoesNotClose,
  escapeDoesNotCloseRule,
  isDialogKind,
  isOverlayKind,
} from './escape-does-not-close.js';

describe('keyboard/escape-does-not-close', () => {
  it('has rule metadata', () => {
    expect(escapeDoesNotCloseRule.id).toBe('keyboard/escape-does-not-close');
    expect(escapeDoesNotCloseRule.wcag).toEqual(['2.1.1']);
    expect(escapeDoesNotCloseRule.tier).toBe('needs-review');
  });

  it('detects the barrier: the overlay stays open after Escape', () => {
    expect(detectEscapeDoesNotClose({ openBefore: true, openAfter: true })).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(detectEscapeDoesNotClose({ openBefore: true, openAfter: false })).toBe(false);
    expect(detectEscapeDoesNotClose({ openBefore: false, openAfter: false })).toBe(false);
  });

  it('knows which state kinds are overlays and dialogs', () => {
    expect(isOverlayKind('modal')).toBe(true);
    expect(isOverlayKind('menu')).toBe(true);
    expect(isOverlayKind('accordion')).toBe(false);
    expect(isOverlayKind(undefined)).toBe(false);
    expect(isDialogKind('dialog')).toBe(true);
    expect(isDialogKind('menu')).toBe(false);
  });
});
