import {
  contextChangeOnInputRule,
  describeInputChange,
  detectContextChangeOnInput,
  mayAnnounceChange,
  type InputChangeObservation,
} from './context-change-on-input.js';

const obs = (over: Partial<InputChangeObservation> = {}): InputChangeObservation => ({
  submitted: [],
  navigations: [],
  windowsOpened: [],
  modalsOpened: [],
  focusMovedTo: null,
  visibleBefore: 40,
  visibleRemoved: 0,
  warned: false,
  ...over,
});

describe('states/context-change-on-input', () => {
  it('has rule metadata', () => {
    expect(contextChangeOnInputRule.id).toBe('states/context-change-on-input');
    expect(contextChangeOnInputRule.wcag).toEqual(['3.2.2']);
  });

  it('detects the barrier: choosing an option loads another page', () => {
    expect(detectContextChangeOnInput(obs({ navigations: ['http://x/?country=be'] }))).toEqual({
      kind: 'navigation',
      tier: 'likely',
      detail: 'http://x/?country=be',
    });
  });

  it('ranks a form submission first, then navigation, window, modal and focus', () => {
    expect(
      detectContextChangeOnInput(obs({ submitted: ['#f'], navigations: ['http://x/?a'] })),
    ).toMatchObject({ kind: 'form-submit', detail: '#f' });
    expect(detectContextChangeOnInput(obs({ windowsOpened: ['help.html'] }))).toMatchObject({
      kind: 'new-window',
    });
    expect(detectContextChangeOnInput(obs({ modalsOpened: ['#confirm'] }))).toMatchObject({
      kind: 'modal-opened',
    });
    expect(detectContextChangeOnInput(obs({ focusMovedTo: '#zip-2' }))).toMatchObject({
      kind: 'focus-moved',
      tier: 'likely',
    });
  });

  it('asks for review when nearby text may announce the behaviour', () => {
    expect(
      detectContextChangeOnInput(obs({ navigations: ['http://x/?a'], warned: true })),
    ).toMatchObject({ kind: 'navigation', tier: 'needs-review' });
  });

  it('asks for review when most of the page is replaced', () => {
    expect(detectContextChangeOnInput(obs({ visibleBefore: 50, visibleRemoved: 40 }))).toEqual({
      kind: 'content-replaced',
      tier: 'needs-review',
    });
    // Small pages and partial changes (a revealed or hidden section) are not reported.
    expect(detectContextChangeOnInput(obs({ visibleBefore: 10, visibleRemoved: 9 }))).toBeNull();
    expect(detectContextChangeOnInput(obs({ visibleBefore: 50, visibleRemoved: 12 }))).toBeNull();
  });

  it('does not flag the correct pattern: the value changes and nothing else happens', () => {
    expect(detectContextChangeOnInput(obs())).toBeNull();
  });

  it('recognises warning text', () => {
    expect(mayAnnounceChange('The page reloads when you choose a country.')).toBe(true);
    expect(mayAnnounceChange('Results update automatically')).toBe(true);
    expect(mayAnnounceChange('Opens in a new window')).toBe(true);
    expect(mayAnnounceChange('Country')).toBe(false);
    expect(mayAnnounceChange('Choose a country, then press Go to see its stores.')).toBe(false);
  });

  it('describes each kind', () => {
    expect(describeInputChange({ kind: 'navigation', tier: 'likely', detail: 'u' })).toBe(
      'loads another page (u)',
    );
    expect(describeInputChange({ kind: 'content-replaced', tier: 'needs-review' })).toBe(
      'replaces most of the page',
    );
  });
});
