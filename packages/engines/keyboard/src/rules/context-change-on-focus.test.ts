import {
  contextChangeOnFocusRule,
  describeContextChange,
  detectContextChangeOnFocus,
  type FocusContextChange,
  type FocusPressInput,
} from './context-change-on-focus.js';

const press = (over: Partial<FocusPressInput> = {}): FocusPressInput => ({
  focused: [{ selector: '#email', tiny: false }],
  finalSelector: '#email',
  finalRelated: true,
  navigations: [],
  windowsOpened: [],
  submitted: [],
  modalsOpened: [],
  ...over,
});

describe('keyboard/context-change-on-focus', () => {
  it('has rule metadata', () => {
    expect(contextChangeOnFocusRule.id).toBe('keyboard/context-change-on-focus');
    expect(contextChangeOnFocusRule.wcag).toEqual(['3.2.1']);
  });

  it('detects a new window opened on focus (violation)', () => {
    expect(detectContextChangeOnFocus(press({ windowsOpened: ['privacy.html'] }))).toEqual({
      kind: 'new-window',
      tier: 'violation',
      trigger: '#email',
      detail: 'privacy.html',
    });
  });

  it('detects navigation on focus (violation) and ranks it first', () => {
    const r = detectContextChangeOnFocus(
      press({ navigations: ['http://x/other'], windowsOpened: ['a'], modalsOpened: ['#d'] }),
    );
    expect(r).toMatchObject({ kind: 'navigation', tier: 'violation', detail: 'http://x/other' });
  });

  it('detects a submitted form and an opened modal (likely)', () => {
    expect(detectContextChangeOnFocus(press({ submitted: ['#f'] }))).toMatchObject({
      kind: 'form-submit',
      tier: 'likely',
    });
    expect(detectContextChangeOnFocus(press({ modalsOpened: ['#promo'] }))).toMatchObject({
      kind: 'modal-opened',
      tier: 'likely',
      detail: '#promo',
    });
  });

  it('detects focus removed (blur on focus) and focus moved elsewhere', () => {
    expect(detectContextChangeOnFocus(press({ finalSelector: null }))).toMatchObject({
      kind: 'focus-removed',
      tier: 'likely',
    });
    expect(
      detectContextChangeOnFocus(
        press({
          focused: [
            { selector: '#email', tiny: false },
            { selector: '#submit', tiny: false },
          ],
          finalSelector: '#submit',
          finalRelated: false,
        }),
      ),
    ).toMatchObject({ kind: 'focus-moved', trigger: '#email', detail: '#submit' });
  });

  it('does not flag the correct pattern: focus just lands on the element', () => {
    expect(detectContextChangeOnFocus(press())).toBeNull();
  });

  it('does not flag focus delegated into a descendant (composite widgets)', () => {
    expect(
      detectContextChangeOnFocus(
        press({
          focused: [
            { selector: '#grid', tiny: false },
            { selector: '#cell-1', tiny: false },
          ],
          finalSelector: '#cell-1',
          finalRelated: true,
        }),
      ),
    ).toBeNull();
  });

  it('does not flag hidden focus-trap sentinels or presses where nothing got focus', () => {
    expect(
      detectContextChangeOnFocus(
        press({
          focused: [
            { selector: '#sentinel-end', tiny: true },
            { selector: '#dialog-first', tiny: false },
          ],
          finalSelector: '#dialog-first',
          finalRelated: false,
        }),
      ),
    ).toBeNull();
    expect(detectContextChangeOnFocus(press({ focused: [], finalSelector: null }))).toBeNull();
  });

  it('describes each kind in a sentence', () => {
    const r = detectContextChangeOnFocus(press({ windowsOpened: ['privacy.html'] }));
    expect(describeContextChange(r as FocusContextChange, '"Email"')).toMatch(
      /opens a new window \(privacy.html\)/,
    );
  });
});
