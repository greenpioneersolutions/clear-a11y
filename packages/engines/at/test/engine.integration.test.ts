import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Page } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import {
  expectFinding,
  expectNoFinding,
  fixtureHarness,
  type OpenFixtureOptions,
} from '@clear-a11y/test-utils';
import { createAtEngine } from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

const scan = async (path: string, options?: OpenFixtureOptions): Promise<Finding[]> =>
  createAtEngine().run((await harness.open(path, options)).ctx);

const expectedDir = join(import.meta.dirname, '../../../../fixtures/expected');
const expectedPages = (dir: string): Array<{ page: string; correctPattern: boolean }> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? expectedPages(join(dir, e.name))
      : e.name.endsWith('.json')
        ? [JSON.parse(readFileSync(join(dir, e.name), 'utf-8'))]
        : [],
  );

describe('engine-at (integration)', () => {
  it('reports nothing on the blank fixture page', async () => {
    expect(await scan('blank.html')).toEqual([]);
  });

  describe('names, roles and states', () => {
    it('finds the disclosure that never exposes aria-expanded', async () => {
      const f = expectFinding(await scan('at/disclosure-no-state.html'), {
        ruleId: 'at/expanded-state-missing',
        selector: '#faq-shipping',
      });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toEqual(['4.1.2']);
      expectFinding(await scan('at/expanded-state-missing.html'), {
        ruleId: 'at/expanded-state-missing',
        selector: '#delivery-toggle',
      });
      expect(await scan('at/expanded-state-missing-ok.html')).toEqual([]);
    });

    it('accepts a popover invoker: the browser exposes its expanded state', async () => {
      // Found by scanning the docs site (Starlight's mobile menu button uses popovertarget).
      expect(
        await scan('at/popover-toggle-ok.html', {
          viewport: { name: 'mobile', width: 320, height: 640 },
        }),
      ).toEqual([]);
    });

    it('finds tabs where no tab is selected', async () => {
      const f = expectFinding(await scan('at/state-missing.html'), {
        ruleId: 'at/state-missing',
        selector: '#plan-tabs',
      });
      expect(f.evidence.axTree).toContain('aria-selected=absent');
      expect(await scan('at/state-missing-ok.html')).toEqual([]);
    });

    it('finds a focusable clickable span without a role', async () => {
      const f = expectFinding(await scan('at/role-missing.html'), {
        ruleId: 'at/role-missing',
        selector: '#in-stock-filter',
      });
      expect(f.tier).toBe('likely');
      expect(f.evidence.axTree).toContain('generic "" (focusable)');
      expect(await scan('at/role-missing-ok.html')).toEqual([]);
    });
  });

  describe('labels', () => {
    it('finds placeholder-only labels, which axe accepts as a name', async () => {
      const f = expectFinding(await scan('static/form-missing-label.html'), {
        ruleId: 'at/placeholder-only-label',
        selector: '#email',
      });
      expect(f.wcag).toContain('3.3.2');
      expect(f.evidence.axTree).toContain('name from placeholder');
      expectFinding(await scan('at/placeholder-only-label.html'), {
        ruleId: 'at/placeholder-only-label',
        selector: '#site-search',
      });
      expect(await scan('at/placeholder-only-label-ok.html')).toEqual([]);
    });

    it('finds a visible label missing from the accessible name', async () => {
      const f = expectFinding(await scan('at/label-in-name.html'), {
        ruleId: 'at/label-in-name',
        selector: '#search-button',
      });
      expect(f.evidence.data).toMatchObject({
        visibleLabel: 'Search',
        accessibleName: 'Find products',
      });
      expect(await scan('at/label-in-name-ok.html')).toEqual([]);
    });
  });

  describe('text alternatives and link text (deterministic patterns)', () => {
    it('finds alt text that is a file name, a URL or a placeholder', async () => {
      const findings = await scan('at/alt-text-suspicious.html');
      for (const selector of ['#product-photo', '#size-chart', '#review-badge']) {
        const f = expectFinding(findings, { ruleId: 'at/alt-text-suspicious', selector });
        expect(f.tier).toBe('likely');
      }
      expectFinding(await scan('ai/alt-filename.html'), {
        ruleId: 'at/alt-text-suspicious',
        selector: '#team-photo',
      });
      expect(await scan('at/alt-text-suspicious-ok.html')).toEqual([]);
      expect(await scan('ai/ok.html')).toEqual([]);
    });

    it('finds identical generic links to different places with no context', async () => {
      const findings = await scan('at/link-text-generic.html');
      for (const selector of ['#news-1', '#news-2', '#news-3']) {
        expectFinding(findings, { ruleId: 'at/link-text-generic', selector, wcag: '2.4.4' });
      }
      const ai = await scan('ai/link-purpose.html');
      expect(ai.filter((f) => f.ruleId === 'at/link-text-generic')).toHaveLength(3);
      expect(await scan('at/link-text-generic-ok.html')).toEqual([]);
    });

    it('leaves a single generic link to the AI layer', async () => {
      const findings = await scan('ai/prompt-injection.html');
      expectNoFinding(findings, { ruleId: 'at/link-text-generic' });
      expectNoFinding(findings, { ruleId: 'at/alt-text-suspicious' });
    });
  });

  describe('status messages and live regions', () => {
    it('finds the add-to-cart confirmation that is not announced', async () => {
      const f = expectFinding(await scan('at/status-message.html'), {
        ruleId: 'at/status-message-not-announced',
        selector: '#cart-status',
      });
      expect(f.evidence.announcement).toBe('nothing announced');
      expectFinding(await scan('at/status-message-not-announced.html'), {
        ruleId: 'at/status-message-not-announced',
        selector: '#save-status',
      });
      expect(await scan('at/status-message-not-announced-ok.html')).toEqual([]);
    });

    it('ignores framework re-renders that rewrite unchanged text', async () => {
      // Found by dogfooding the desktop app (S14): Preact rewrites "0" and "" text nodes.
      expect(await scan('at/status-rerender-ok.html')).toEqual([]);
    });

    it('finds a live region inserted together with its message', async () => {
      const findings = await scan('at/live-region-inserted-with-content.html');
      expectFinding(findings, {
        ruleId: 'at/live-region-inserted-with-content',
        selector: '#coupon-status',
      });
      expectNoFinding(findings, { ruleId: 'at/status-message-not-announced' });
      expect(await scan('at/live-region-inserted-with-content-ok.html')).toEqual([]);
    });
  });

  describe('form errors (engine submits the form itself in the default state)', () => {
    it('finds silent, unassociated errors on the sign-up form', async () => {
      const findings = await scan('states/form-errors.html');
      const announced = expectFinding(findings, {
        ruleId: 'at/error-not-announced',
        selector: '#email-error',
      });
      expect(announced.evidence.announcement).toBe('nothing announced');
      expectFinding(findings, { ruleId: 'at/error-not-associated', selector: '#email' });
      expectFinding(findings, { ruleId: 'at/error-not-associated', selector: '#password' });
      expectNoFinding(findings, { ruleId: 'at/error-not-identified' });
    });

    it('finds each form error barrier and passes its correct pattern', async () => {
      expectFinding(await scan('at/error-not-announced.html'), {
        ruleId: 'at/error-not-announced',
      });
      expect(await scan('at/error-not-announced-ok.html')).toEqual([]);

      const assoc = await scan('at/error-not-associated.html');
      expectFinding(assoc, { ruleId: 'at/error-not-associated', selector: '#card-number' });
      expectNoFinding(assoc, { ruleId: 'at/error-not-announced' });
      expect(await scan('at/error-not-associated-ok.html')).toEqual([]);

      const ident = expectFinding(await scan('at/error-not-identified.html'), {
        ruleId: 'at/error-not-identified',
        selector: '#postcode',
      });
      expect(ident.tier).toBe('violation');
      expect(await scan('at/error-not-identified-ok.html')).toEqual([]);
    });

    it('replays a form-invalid state from the state explorer with the recorder watching', async () => {
      const replay = async (page: Page) => {
        await page.locator('#signup button[type=submit]').click();
      };
      const stateMeta = { kind: 'form-invalid', triggerSelector: '#signup', replay };
      const findings = await scan('states/form-errors.html', {
        state: 'form-invalid#signup',
        stateMeta,
      });
      const f = expectFinding(findings, { ruleId: 'at/error-not-announced' });
      expect(f.page.state).toBe('form-invalid#signup');
      expectFinding(findings, { ruleId: 'at/error-not-associated', selector: '#email' });

      const ok = await scan('states/ok.html', { state: 'form-invalid#signup', stateMeta });
      expect(ok).toEqual([]);
    });
  });

  describe('media, input purpose and pointer/keyboard interactions (wcag/)', () => {
    it('asks about captions, transcripts and audio descriptions', async () => {
      const captions = expectFinding(await scan('wcag/1-2-2-captions.html'), {
        ruleId: 'at/media-captions-missing',
        selector: '#product-tour',
      });
      expect(captions.tier).toBe('needs-review');
      expect(captions.question).toMatch(/\?$/);
      const live = expectFinding(await scan('wcag/1-2-4-live-captions.html'), {
        ruleId: 'at/media-captions-missing',
        selector: '#live-keynote',
      });
      expect(live.wcag).toEqual(['1.2.4']);
      expect(
        expectFinding(await scan('wcag/1-2-1-audio-only.html'), {
          ruleId: 'at/media-alternative-missing',
          selector: '#episode-12',
        }).wcag,
      ).toEqual(['1.2.1']);
      expect(
        expectFinding(await scan('wcag/1-2-3-media-alternative.html'), {
          ruleId: 'at/media-alternative-missing',
        }).wcag,
      ).toContain('1.2.3');
      expect(
        expectFinding(await scan('wcag/1-2-5-audio-description.html'), {
          ruleId: 'at/media-alternative-missing',
        }).wcag,
      ).toEqual(['1.2.5']);
      for (const ok of ['1-2-1-audio-only', '1-2-2-captions', '1-2-3-media-alternative'])
        expect(await scan(`wcag/${ok}-ok.html`)).toEqual([]);
      expect(await scan('wcag/1-2-4-live-captions-ok.html')).toEqual([]);
      expect(await scan('wcag/1-2-5-audio-description-ok.html')).toEqual([]);
    });

    it('finds autoplaying sound with no way to stop it', async () => {
      const findings = await scan('wcag/1-4-2-audio-control.html');
      expect(findings.map((f) => f.ruleId)).toEqual(['at/audio-autoplay-no-control']);
      expect(findings[0]!.tier).toBe('likely');
      expect(await scan('wcag/1-4-2-audio-control-ok.html')).toEqual([]);
    });

    it('finds personal-data fields without autocomplete tokens', async () => {
      const findings = await scan('wcag/1-3-5-input-purpose.html');
      expect(findings.map((f) => f.target.selector).sort()).toEqual([
        '#email',
        '#full-name',
        '#phone',
      ]);
      expect(findings.every((f) => f.ruleId === 'at/autocomplete-missing')).toBe(true);
      expect(await scan('wcag/1-3-5-input-purpose-ok.html')).toEqual([]);
    });

    it('finds a password field that blocks paste', async () => {
      const f = expectFinding(await scan('wcag/3-3-8-accessible-authentication.html'), {
        ruleId: 'at/auth-paste-blocked',
        selector: '#password',
      });
      expect(f.evidence.data).toMatchObject({ pasteBlocked: true });
      expect(await scan('wcag/3-3-8-accessible-authentication-ok.html')).toEqual([]);
    });

    it('finds single-character shortcuts by pressing keys with nothing focused', async () => {
      const f = expectFinding(await scan('wcag/2-1-4-character-key-shortcuts.html'), {
        ruleId: 'at/character-key-shortcut',
        selector: 'html',
      });
      const keys = (f.evidence.data?.['keys'] as Array<{ key: string }>).map((k) => k.key);
      expect(keys).toEqual(expect.arrayContaining(['j', 'k', 's']));
      expect(await scan('wcag/2-1-4-character-key-shortcuts-ok.html')).toEqual([]);
    });

    it('finds actions that fire on pointer down', async () => {
      const findings = await scan('wcag/2-5-2-pointer-cancellation.html');
      expect(findings.map((f) => f.target.selector).sort()).toEqual([
        '#delete-home',
        '#delete-work',
      ]);
      expect(await scan('wcag/2-5-2-pointer-cancellation-ok.html')).toEqual([]);
    });

    it('asks about motion listeners and drag-only interactions', async () => {
      expectFinding(await scan('wcag/2-5-4-motion-actuation.html'), {
        ruleId: 'at/motion-actuation',
        selector: 'html',
      });
      expect(await scan('wcag/2-5-4-motion-actuation-ok.html')).toEqual([]);
      expectFinding(await scan('wcag/2-5-7-dragging-movements.html'), {
        ruleId: 'at/drag-without-alternative',
        selector: '#task-list',
      });
      expectFinding(await scan('wcag/2-5-1-pointer-gestures.html'), {
        ruleId: 'at/drag-without-alternative',
        selector: '#gallery',
      });
      expect(await scan('wcag/2-5-7-dragging-movements-ok.html')).toEqual([]);
      // Carousel Next buttons hide what they showed but never bring the first slide back: not a
      // disclosure, so no expanded-state finding either.
      expect(await scan('wcag/2-5-1-pointer-gestures-ok.html')).toEqual([]);
    });
  });

  it('honors probe limits from config', async () => {
    const findings = await scan('at/status-message.html', {
      config: { at: { probeButtons: 0, probeForms: 0 } },
    });
    expect(findings).toEqual([]);
  });

  it('reports nothing on any correct-pattern page and no stray violations elsewhere', async () => {
    const pages = expectedPages(expectedDir);
    expect(pages.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const { page, correctPattern } of pages) {
      const findings = await scan(page);
      const flagged = correctPattern ? findings : findings.filter((f) => f.tier === 'violation');
      const expected = correctPattern
        ? []
        : (JSON.parse(readFileSync(join(expectedDir, page.replace(/\.html$/, '.json')), 'utf-8'))
            .issues as Array<{ selector: string; wcag: string[] }>);
      for (const f of flagged) {
        const matched = expected.some(
          (i) =>
            i.wcag.some((sc) => f.wcag.includes(sc)) &&
            i.selector.split(' | ').some((s) => s === f.target.selector || s === '*'),
        );
        if (!matched) problems.push(`${page}: ${f.ruleId} [${f.tier}] on ${f.target.selector}`);
      }
    }
    expect(problems, relative(process.cwd(), expectedDir)).toEqual([]);
  }, 900_000);
});
