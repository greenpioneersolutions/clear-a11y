import { resolveConfig } from '@clear-a11y/core';
import { classifyState, significant, type Candidate, type Revealed } from './classify.js';
import { invalidValueFor, type FieldInfo } from './invalid-value.js';
import { resolveStatesOptions } from './options.js';
import { isDestructiveName, sameDocument, shouldAbort } from './safety.js';
import { slug, stateId, uniqueId } from './state-id.js';
import { newTexts, visibleSetDiff } from './visible-set-diff.js';

describe('visibleSetDiff', () => {
  it('returns added, removed and the roots of revealed subtrees', () => {
    const before = [
      [1, 0],
      [2, 1],
      [3, 1],
    ] as const;
    const after = [
      [1, 0],
      [2, 1],
      [4, 1], // new panel
      [5, 4], // inside the new panel
      [6, 5],
      [7, 2], // new element under an existing one
    ] as const;
    expect(visibleSetDiff([...before], [...after])).toEqual({
      added: [4, 5, 6, 7],
      removed: [3],
      roots: [4, 7],
    });
  });

  it('is empty when nothing changed', () => {
    expect(visibleSetDiff([[1, 0]], [[1, 0]])).toEqual({ added: [], removed: [], roots: [] });
  });
});

describe('newTexts', () => {
  it('finds new elements with text and elements whose text changed', () => {
    expect(
      newTexts(
        [
          [1, 'Email'],
          [2, 'Old'],
        ],
        [
          [1, 'Email'],
          [2, 'Required'],
          [3, 'Enter a password'],
          [4, '   '],
        ],
      ),
    ).toEqual([
      [2, 'Required'],
      [3, 'Enter a password'],
    ]);
  });
});

describe('stateId', () => {
  it('is stable and sanitized', () => {
    expect(stateId('dialog', 'settings-dialog')).toBe('dialog:open#settings-dialog');
    expect(stateId('dialog', '#settings-dialog')).toBe('dialog:open#settings-dialog');
    expect(stateId('form-invalid', 'signup')).toBe('form-invalid#signup');
    expect(stateId('form-empty', '#main > form:nth-of-type(2)')).toBe(
      'form-empty#main-form-nth-of-type-2',
    );
    expect(stateId('menu', 'Main menu (mobile)!')).toBe('menu:open#Main-menu-mobile');
    expect(stateId('tooltip', '***')).toBe('tooltip:open#tooltip');
    expect(stateId('menu', 'x'.repeat(80))).toBe(`menu:open#${'x'.repeat(40)}`);
  });

  it('slug never ends with a dash after truncation', () => {
    expect(slug(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39));
  });

  it('uniqueId appends a counter', () => {
    expect(uniqueId('menu:open#nav', new Set())).toBe('menu:open#nav');
    expect(uniqueId('menu:open#nav', new Set(['menu:open#nav', 'menu:open#nav-2']))).toBe(
      'menu:open#nav-3',
    );
  });
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  selector: '#trigger',
  reason: 'button',
  name: 'Open',
  tag: 'button',
  role: '',
  id: 'trigger',
  inHeading: false,
  clickable: true,
  ...over,
});
const revealed = (over: Partial<Revealed> = {}): Revealed => ({
  selector: '#panel',
  id: 'panel',
  tag: 'div',
  role: '',
  textLength: 40,
  links: 0,
  interactive: 0,
  dialog: false,
  dialogId: '',
  menu: false,
  tabpanel: false,
  tooltip: false,
  popover: false,
  navLike: false,
  inDetails: false,
  ...over,
});

describe('classifyState', () => {
  it('classifies dialogs by the dialog inside the revealed content', () => {
    expect(
      classifyState(candidate(), 'click', [
        revealed({ id: 'backdrop', dialog: true, dialogId: 'settings-dialog' }),
      ]),
    ).toEqual({ kind: 'dialog', target: 'settings-dialog' });
  });

  it('classifies menus, tabs, popovers and accordions', () => {
    expect(
      classifyState(candidate({ reason: 'toggle' }), 'click', [revealed({ menu: true })]).kind,
    ).toBe('menu');
    expect(
      classifyState(candidate({ reason: 'toggle', controls: 'site-menu' }), 'click', [
        revealed({ id: 'site-menu', tag: 'nav', links: 3, navLike: true }),
      ]),
    ).toEqual({ kind: 'menu', target: 'site-menu' });
    expect(classifyState(candidate({ reason: 'tab' }), 'click', [revealed()]).kind).toBe('tab');
    expect(classifyState(candidate({ popovertarget: 'p' }), 'click', [revealed()]).kind).toBe(
      'popover',
    );
    expect(
      classifyState(candidate({ reason: 'toggle', haspopup: 'menu' }), 'click', [revealed()]).kind,
    ).toBe('menu');
    expect(classifyState(candidate({ inHeading: true }), 'click', [revealed()])).toEqual({
      kind: 'accordion',
      target: 'panel',
    });
  });

  it('names summary disclosures after their details element', () => {
    expect(
      classifyState(candidate({ reason: 'summary', controls: 'faq', id: '' }), 'click', [
        revealed({ id: '', inDetails: true }),
      ]),
    ).toEqual({ kind: 'disclosure', target: 'faq' });
  });

  it('classifies hover and focus reveals as tooltips (or hover menus)', () => {
    expect(
      classifyState(candidate({ reason: 'tooltip' }), 'hover', [revealed({ id: 'tip' })]),
    ).toEqual({
      kind: 'tooltip',
      target: 'tip',
    });
    expect(
      classifyState(candidate({ reason: 'tooltip' }), 'focus', [
        revealed({ links: 4, navLike: true }),
      ]).kind,
    ).toBe('menu');
  });

  it('falls back to the trigger name for the target and to disclosure for the kind', () => {
    expect(classifyState(candidate({ id: '' }), 'click', [revealed({ id: '' })])).toEqual({
      kind: 'disclosure',
      target: 'Open',
    });
  });

  it('significant drops empty revealed boxes', () => {
    expect(
      significant([revealed({ textLength: 0 }), revealed({ textLength: 0, interactive: 1 })]),
    ).toHaveLength(1);
  });
});

const field = (over: Partial<FieldInfo>): FieldInfo => ({
  selector: '#f',
  tag: 'input',
  type: 'text',
  required: false,
  ...over,
});

describe('invalidValueFor', () => {
  it('breaks type, range, pattern and length constraints', () => {
    expect(invalidValueFor(field({ type: 'email' }))).toBe('not-an-email');
    expect(invalidValueFor(field({ type: 'url' }))).toBe('not a url');
    expect(invalidValueFor(field({ type: 'number', min: '1', max: '10' }))).toBe('0');
    expect(invalidValueFor(field({ type: 'number', max: '10' }))).toBe('11');
    expect(invalidValueFor(field({ type: 'tel', pattern: '[0-9 ]{7,}' }))).toBe('!');
    expect(invalidValueFor(field({ pattern: '[^!]+' }))).toBe('!');
    expect(invalidValueFor(field({ pattern: '.*' }))).toBeUndefined();
    expect(invalidValueFor(field({ minLength: 8, type: 'password' }))).toBe('aaaaaaa');
    expect(invalidValueFor(field({ tag: 'textarea', type: 'textarea', minLength: 3 }))).toBe('aa');
  });

  it('returns undefined when typed text cannot break the field', () => {
    expect(invalidValueFor(field({}))).toBeUndefined();
    expect(invalidValueFor(field({ required: true }))).toBeUndefined();
    expect(invalidValueFor(field({ type: 'number' }))).toBeUndefined();
    expect(invalidValueFor(field({ type: 'checkbox', required: true }))).toBeUndefined();
    expect(invalidValueFor(field({ tag: 'select', type: 'select' }))).toBeUndefined();
    expect(invalidValueFor(field({ pattern: '(' }))).toBeUndefined();
  });
});

describe('safety', () => {
  it('recognises destructive control names', () => {
    for (const name of [
      'Delete account',
      'Remove item',
      'Log out',
      'Sign out',
      'Logout',
      'Buy now',
      'Pay 64 EUR',
      'Checkout',
      'Unsubscribe',
      'Cancel my subscription',
    ]) {
      expect(isDestructiveName(name), name).toBe(true);
    }
    for (const name of [
      'Open settings',
      'Menu',
      'Show plan details',
      'Save preferences',
      'Payment options help',
    ]) {
      expect(isDestructiveName(name), name).toBe(false);
    }
  });

  const page = 'http://127.0.0.1:4173/states/ok.html';
  const req = (over: Partial<Parameters<typeof shouldAbort>[0]>) => ({
    method: 'GET',
    url: 'http://127.0.0.1:4173/app.js',
    isNavigation: false,
    isMainFrame: true,
    ...over,
  });

  it('aborts non-GET requests and navigations away from the page', () => {
    expect(shouldAbort(req({ method: 'POST' }), page)).toBe(true);
    expect(shouldAbort(req({ method: 'delete' }), page)).toBe(true);
    expect(shouldAbort(req({ url: 'https://evil.example/', isNavigation: true }), page)).toBe(true);
    expect(
      shouldAbort(req({ url: 'http://127.0.0.1:4173/account', isNavigation: true }), page),
    ).toBe(true);
    expect(shouldAbort(req({ url: `${page}?q=1`, isNavigation: true }), page)).toBe(true);
  });

  it('allows GET subresources, same-page reloads, hash changes and iframes', () => {
    expect(shouldAbort(req({}), page)).toBe(false);
    expect(shouldAbort(req({ method: 'HEAD' }), page)).toBe(false);
    expect(shouldAbort(req({ url: page, isNavigation: true }), page)).toBe(false);
    expect(shouldAbort(req({ url: `${page}#faq`, isNavigation: true }), page)).toBe(false);
    expect(
      shouldAbort(
        req({ url: 'https://maps.example/', isNavigation: true, isMainFrame: false }),
        page,
      ),
    ).toBe(false);
    expect(sameDocument(`${page}#a`, page)).toBe(true);
  });
});

describe('resolveStatesOptions', () => {
  it('applies defaults and validates config.states', () => {
    const opts = resolveStatesOptions(resolveConfig());
    expect(opts).toMatchObject({ maxStates: 10, maxCandidates: 60, budgetMs: 24_000 });
    expect(resolveStatesOptions(resolveConfig({ states: { maxStates: 3 } })).maxStates).toBe(3);
    expect(() => resolveStatesOptions(resolveConfig({ states: { maxStates: -1 } }))).toThrow();
  });
});
