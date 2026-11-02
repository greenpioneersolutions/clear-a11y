import type { Page, StateMeta } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { expectFinding, expectNoFinding, fixtureHarness } from '@clear-a11y/test-utils';
import { createKeyboardEngine } from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

const scan = async (path: string, options: { state?: string; stateMeta?: StateMeta } = {}) =>
  createKeyboardEngine().run((await harness.open(path, options)).ctx);

/** The state explorer (S03) hands over overlay states like this; here we build them by hand. */
const dialogState = (trigger: string): { state: string; stateMeta: StateMeta } => ({
  state: `modal:open${trigger}`,
  stateMeta: {
    kind: 'modal',
    triggerSelector: trigger,
    replay: async (page: Page) => {
      await page.click(trigger);
    },
  },
});

const summary = (findings: Finding[]) =>
  findings.map((f) => `${f.ruleId} [${f.tier}] ${f.target.selector}`);

describe('engine-keyboard (integration)', () => {
  describe('correct patterns produce zero findings', () => {
    it.each([
      'blank.html',
      'index.html',
      'keyboard/ok.html',
      'states/ok.html',
      'keyboard/focus-order-backward-ok.html',
      'keyboard/focus-order-two-column-ok.html',
      'keyboard/focus-not-visible-ok.html',
      'keyboard/focus-obscured-ok.html',
      'keyboard/keyboard-trap-ok.html',
      'keyboard/modal-contained-ok.html',
      'keyboard/click-not-focusable-ok.html',
      'keyboard/escape-does-not-close-ok.html',
      'keyboard/focus-not-returned-ok.html',
      'keyboard/overlay-focus-not-moved-ok.html',
      'keyboard/skip-link-broken-ok.html',
      'keyboard/skip-link-missing-ok.html',
      'keyboard/context-change-on-focus-ok.html',
    ])('%s', async (path) => {
      expect(summary(await scan(path))).toEqual([]);
    });

    it.each([
      ['states/ok.html', '#open-settings'],
      ['keyboard/escape-does-not-close-ok.html', '#open-filters'],
      ['keyboard/focus-not-returned-ok.html', '#open-share'],
      ['keyboard/overlay-focus-not-moved-ok.html', '#open-help'],
    ])('%s in its dialog state', async (path, trigger) => {
      expect(summary(await scan(path, dialogState(trigger)))).toEqual([]);
    });
  });

  describe('context change on focus (3.2.1)', () => {
    it('reports the field that opens a window when it receives focus, without opening it', async () => {
      const fx = await harness.open('keyboard/context-change-on-focus.html');
      const findings = await createKeyboardEngine().run(fx.ctx);
      const f = expectFinding(findings, {
        ruleId: 'keyboard/context-change-on-focus',
        selector: '#email',
      });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toEqual(['3.2.1']);
      expect(f.evidence.data).toMatchObject({ change: 'new-window', detail: '../index.html' });
      expect(f.evidence.focusPath?.some((s) => s.selector === '#email')).toBe(true);
      expect(fx.page.context().pages()).toHaveLength(1);
      expect(summary(findings)).toEqual(['keyboard/context-change-on-focus [violation] #email']);
    });

    it('reports links that navigate on focus and keeps the page loaded', async () => {
      const fx = await harness.open('keyboard/context-change-on-focus-navigation.html');
      const findings = await createKeyboardEngine().run(fx.ctx);
      const f = expectFinding(findings, {
        ruleId: 'keyboard/context-change-on-focus',
        selector: '#orders-link',
      });
      expect(f.tier).toBe('violation');
      expect(f.evidence.data).toMatchObject({ change: 'navigation' });
      expect(String(f.evidence.data?.['detail'])).toMatch(/section=orders$/);
      expect(summary(findings)).toEqual([
        'keyboard/context-change-on-focus [violation] #orders-link',
        'keyboard/context-change-on-focus [violation] #settings-link',
      ]);
      expect(fx.page.url()).toBe(fx.url);
    });
  });

  it('finds the backward focus jump and marks it in the focus path', async () => {
    const findings = await scan('keyboard/focus-order-backward.html');
    const f = expectFinding(findings, {
      ruleId: 'keyboard/focus-order-backward',
      selector: '#last-name',
    });
    expect(f.tier).toBe('likely');
    const path = f.evidence.focusPath ?? [];
    expect(path.map((s) => s.selector)).toEqual([
      '#first-name',
      '#country',
      '#last-name',
      '#submit',
    ]);
    expect(path.filter((s) => s.backward).map((s) => s.selector)).toEqual(['#last-name']);
  });

  it('finds focus indicators that were removed', async () => {
    const findings = await scan('keyboard/focus-not-visible.html');
    for (const selector of ['#link-home', '#link-pricing', '#link-contact']) {
      const f = expectFinding(findings, { ruleId: 'keyboard/focus-not-visible', selector });
      expect(f.tier).toBe('violation');
      expect(f.evidence.screenshot).toMatch(/^memory:/);
    }
  });

  it('asks for review of a faint focus outline', async () => {
    const findings = await scan('keyboard/focus-low-contrast.html');
    const f = expectFinding(findings, {
      ruleId: 'keyboard/focus-not-visible',
      selector: '#link-home',
    });
    expect(f.tier).toBe('needs-review');
    expect(f.wcag).toContain('1.4.11');
    expectNoFinding(findings, { tier: 'violation' });
  });

  it('finds links hidden under a sticky footer', async () => {
    const findings = await scan('keyboard/focus-obscured.html');
    expectFinding(findings, { ruleId: 'keyboard/focus-obscured', selector: '#terms-link' });
    expectNoFinding(findings, { ruleId: 'keyboard/focus-obscured', selector: '#promo-link' });
    // The hidden focus ring is a consequence of 2.4.11, not a separate 2.4.7 failure.
    expectNoFinding(findings, { ruleId: 'keyboard/focus-not-visible' });
  });

  describe('2.4.11 exception for content opened by the user', () => {
    const page = 'keyboard/focus-obscured-dismissible-ok.html';
    const opened = (blockEscape: boolean) => ({
      state: 'disclosure:open#help-panel',
      stateMeta: {
        kind: 'disclosure',
        triggerSelector: '#help-toggle',
        replay: async (p: Page) => {
          if (blockEscape)
            await p.evaluate(() =>
              window.addEventListener(
                'keydown',
                (e) => e.key === 'Escape' && e.stopImmediatePropagation(),
                true,
              ),
            );
          await p.click('#help-toggle');
        },
      },
    });

    it('accepts a covered link when Escape closes the panel without moving focus', async () => {
      expect(summary(await scan(page, opened(false)))).toEqual([]);
    });

    it('still reports it when the panel cannot be dismissed', async () => {
      const f = expectFinding(await scan(page, opened(true)), {
        ruleId: 'keyboard/focus-obscured',
        selector: '#scan-guide',
      });
      expect(f.tier).toBe('violation');
    });
  });

  it('finds the keyboard trap', async () => {
    const findings = await scan('keyboard/keyboard-trap.html');
    const f = expectFinding(findings, { ruleId: 'keyboard/keyboard-trap', selector: '#editor' });
    expect(f.tier).toBe('violation');
    expect(f.evidence.data).toMatchObject({ cycle: ['#editor'], escapedAfterEscape: false });
  });

  it('finds mouse-only controls (onclick and addEventListener)', async () => {
    expectFinding(await scan('keyboard/clickable-div.html'), {
      ruleId: 'keyboard/click-not-focusable',
      selector: '#pay-now',
    });
    const f = expectFinding(await scan('keyboard/click-not-focusable.html'), {
      ruleId: 'keyboard/click-not-focusable',
      selector: '#wishlist',
    });
    expect(f.tier).toBe('likely');
    expect(f.evidence.data).toMatchObject({ clickListener: true });
  });

  it('finds a broken skip link', async () => {
    const f = expectFinding(await scan('keyboard/skip-link-broken.html'), {
      ruleId: 'keyboard/skip-link-broken',
      selector: '#skip-link',
    });
    expect(f.tier).toBe('violation');
  });

  it('asks about bypassing long navigation without skip link, landmarks or headings', async () => {
    const f = expectFinding(await scan('keyboard/skip-link-missing.html'), {
      ruleId: 'keyboard/skip-link-missing',
      selector: '#site-header',
    });
    expect(f.tier).toBe('needs-review');
  });

  describe('overlay states (stateMeta from the state explorer)', () => {
    it('reports nothing about overlays in the default state', async () => {
      for (const path of [
        'keyboard/escape-does-not-close.html',
        'keyboard/focus-not-returned.html',
        'keyboard/overlay-focus-not-moved.html',
        'states/modal-focus.html',
      ]) {
        expect(summary(await scan(path))).toEqual([]);
      }
    });

    it('finds both modal-focus issues: focus not moved in, focus not returned', async () => {
      const findings = await scan('states/modal-focus.html', dialogState('#open-settings'));
      expectFinding(findings, {
        ruleId: 'keyboard/overlay-focus-not-moved',
        selector: '#settings-dialog',
      });
      const back = expectFinding(findings, {
        ruleId: 'keyboard/focus-not-returned',
        selector: '#close-settings',
      });
      expect(back.evidence.data).toMatchObject({ closedBy: 'close-control' });
      expectNoFinding(findings, { tier: 'violation' });
    });

    it('asks about a dialog that ignores Escape', async () => {
      const findings = await scan(
        'keyboard/escape-does-not-close.html',
        dialogState('#open-filters'),
      );
      expect(summary(findings)).toEqual([
        'keyboard/escape-does-not-close [needs-review] #filters-dialog',
      ]);
    });

    it('finds focus not returned after Escape closes the dialog', async () => {
      const findings = await scan('keyboard/focus-not-returned.html', dialogState('#open-share'));
      expect(summary(findings)).toEqual(['keyboard/focus-not-returned [likely] #share-dialog']);
    });

    it('finds a dialog that does not take focus', async () => {
      const findings = await scan(
        'keyboard/overlay-focus-not-moved.html',
        dialogState('#open-help'),
      );
      expect(summary(findings)).toEqual(['keyboard/overlay-focus-not-moved [likely] #help-dialog']);
    });
  });
});
