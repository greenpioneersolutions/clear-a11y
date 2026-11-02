import {
  characterKeyShortcutRule,
  detectCharacterKeyShortcut,
  SHORTCUT_KEYS,
  type KeyPressEffect,
} from './character-key-shortcut.js';

const press = (key: string, over: Partial<KeyPressEffect> = {}): KeyPressEffect => ({
  key,
  focusMoved: false,
  domChanged: false,
  scrolled: false,
  navigated: false,
  ...over,
});

describe('at/character-key-shortcut', () => {
  it('has rule metadata', () => {
    expect(characterKeyShortcutRule.id).toBe('at/character-key-shortcut');
    expect(characterKeyShortcutRule.wcag).toEqual(['2.1.4']);
    expect(characterKeyShortcutRule.tier).toBe('needs-review');
    expect(SHORTCUT_KEYS).toContain('s');
    expect(SHORTCUT_KEYS).not.toContain(' ');
  });

  it('detects keys that move focus, change the page, scroll or navigate', () => {
    const hits = detectCharacterKeyShortcut({
      baselineChanges: false,
      presses: [
        press('a'),
        press('s', { focusMoved: true }),
        press('j', { domChanged: true }),
        press('g', { scrolled: true }),
      ],
    });
    expect(hits.map((h) => h.key)).toEqual(['s', 'j', 'g']);
  });

  it('ignores DOM changes on a page that changes by itself', () => {
    const hits = detectCharacterKeyShortcut({
      baselineChanges: true,
      presses: [press('j', { domChanged: true }), press('s', { focusMoved: true })],
    });
    expect(hits.map((h) => h.key)).toEqual(['s']);
  });

  it('does not flag the correct pattern', () => {
    expect(
      detectCharacterKeyShortcut({ baselineChanges: false, presses: [press('a'), press('/')] }),
    ).toEqual([]);
  });
});
