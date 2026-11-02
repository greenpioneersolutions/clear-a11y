import type { PassInput } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { expectFinding, expectNoFinding, fixtureHarness } from '@clear-a11y/test-utils';
import { createVisualEngine } from '../src/index.js';

const harness = fixtureHarness();

/** Every check except motion, to time the 2.2.2 tests on their own. */
const OTHER_CHECKS = [
  'reflow',
  'textResize',
  'textSpacing',
  'contrast',
  'nonTextContrast',
  'targetSize',
  'hover',
  'orientation',
];
afterAll(() => harness.close());

const scan = async (path: string, config?: Record<string, unknown>): Promise<Finding[]> => {
  const fx = await harness.open(path, config ? { config: { visual: config } } : {});
  const findings = await createVisualEngine().run(fx.ctx);
  await fx.close();
  return findings;
};

/** Correct-pattern pages: the engine must report nothing at all, in any tier. */
const OK_PAGES = [
  'blank.html',
  'visual/ok.html',
  'visual/reflow-horizontal-scroll-ok.html',
  'visual/reflow-two-dimensional-ok.html',
  'visual/text-resize-clipped-ok.html',
  'visual/text-spacing-clipped-ok.html',
  'visual/text-overlap-ok.html',
  'visual/contrast-over-background-ok.html',
  'visual/non-text-contrast-ok.html',
  'visual/target-size-ok.html',
  'visual/target-size-inline-link-ok.html',
  'visual/hover-content-not-dismissible-ok.html',
  'visual/hover-content-not-hoverable-ok.html',
  'visual/hover-content-not-persistent-ok.html',
  // Found by scanning the docs site (S15): inline links wrapping across lines were compared by
  // their bounding boxes, and a hover-revealed heading anchor "covered" only the heading's padding.
  'visual/wrapped-links-ok.html',
  'visual/heading-anchor-hover-ok.html',
  // Found by dogfooding the desktop app (S14): text inside a closed <details> was measured.
  'visual/details-closed-ok.html',
  'visual/motion-without-pause-ok.html',
  'visual/orientation-locked-ok.html',
  'keyboard/ok.html',
  'static/ok.html',
];

describe('engine-visual (integration)', () => {
  it.each(OK_PAGES)('reports nothing on %s', async (page) => {
    expectNoFinding(await scan(page));
  });

  describe('reflow (1.4.10)', () => {
    it('finds the fixed-width layout box and restores the viewport', async () => {
      const fx = await harness.open('visual/reflow-horizontal-scroll.html');
      const findings = await createVisualEngine().run(fx.ctx);
      const f = expectFinding(findings, {
        ruleId: 'visual/reflow-horizontal-scroll',
        selector: '#layout',
      });
      expect(f.tier).toBe('violation');
      expect(f.evidence.data).toMatchObject({ viewportWidth: 320, documentScrollWidth: 976 });
      expect(f.evidence.screenshot).toMatch(/^memory:/);
      expect(fx.page.viewportSize()).toEqual({ width: 1280, height: 800 });
      await fx.close();
    });

    it('finds the 1100px content column on the S00 reflow page', async () => {
      expectFinding(await scan('visual/reflow.html'), {
        ruleId: 'visual/reflow-horizontal-scroll',
        selector: '#content',
      });
    });

    it('asks about a sideways-scrolling region that is not a table', async () => {
      const f = expectFinding(await scan('visual/reflow-two-dimensional.html'), {
        ruleId: 'visual/reflow-two-dimensional',
        selector: '#plans',
      });
      expect(f.tier).toBe('needs-review');
      expect(f.question).toMatch(/two-dimensional/);
    });
  });

  describe('text resize (1.4.4)', () => {
    it('finds the clipped button label at the 200% zoom layout', async () => {
      const f = expectFinding(await scan('visual/text-resize-clipped.html'), {
        ruleId: 'visual/text-resize-clipped',
        selector: '#subscribe-button',
      });
      expect(f.tier).toBe('violation');
      expect(f.evidence.data).toMatchObject({ mode: 'zoom' });
    });

    it('finds the heading that overlaps the paragraph when text is enlarged', async () => {
      const f = expectFinding(await scan('visual/text-overlap.html'), {
        ruleId: 'visual/text-overlap',
        selector: '#promo-heading',
      });
      expect(f.tier).toBe('likely');
      expect(f.wcag).toEqual(['1.4.4']);
    });
  });

  describe('text spacing (1.4.12)', () => {
    it('finds the note clipped by the WCAG spacing overrides', async () => {
      const f = expectFinding(await scan('visual/text-spacing-clipped.html'), {
        ruleId: 'visual/text-spacing-clipped',
        selector: '#shipping-note',
      });
      expect(f.tier).toBe('violation');
    });

    it('finds the clipped card text on the S00 text-spacing page', async () => {
      expectFinding(await scan('visual/text-spacing.html'), {
        ruleId: 'visual/text-spacing-clipped',
        selector: '#card-text',
      });
    });

    it('removes the spacing overrides afterwards', async () => {
      const fx = await harness.open('visual/text-spacing.html');
      await createVisualEngine().run(fx.ctx);
      const left = await fx.page.evaluate(() => ({
        style: !!document.getElementById('ca11y-visual-text-spacing'),
        fontSize: document.documentElement.style.fontSize,
      }));
      expect(left).toEqual({ style: false, fontSize: '' });
      await fx.close();
    });
  });

  describe('real-pixel contrast (1.4.3, 1.4.11)', () => {
    it('finds white text on a pale gradient that rules scanners can only flag for review', async () => {
      const f = expectFinding(await scan('visual/contrast-over-image.html'), {
        ruleId: 'visual/contrast-over-background',
        selector: '#hero-title',
      });
      expect(f.tier).toBe('violation');
      expect(f.evidence.data).toMatchObject({ method: 'real-pixel', threshold: 3 });
      expect(f.evidence.data?.['median']).toBeLessThan(1.5);
    });

    it('finds white text on a pale local photo', async () => {
      const f = expectFinding(await scan('visual/contrast-over-background.html'), {
        ruleId: 'visual/contrast-over-background',
        selector: '#banner-caption',
      });
      expect(f.evidence.data).toMatchObject({ threshold: 4.5 });
    });

    it('records verified passes for text on gradients (ADR 0003)', async () => {
      const fx = await harness.open('visual/ok.html');
      const passes: PassInput[] = [];
      fx.ctx.recordPass = (p) => passes.push(p);
      expect(await createVisualEngine().run(fx.ctx)).toEqual([]);
      await fx.close();
      const h2 = passes.find((p) => p.selector === 'body > main > div:nth-of-type(1) > h2');
      expect(h2).toMatchObject({ ruleId: 'visual/contrast-over-background', wcag: ['1.4.3'] });
      expect(h2?.evidence?.data).toMatchObject({
        method: 'real-pixel',
        background: 'background-image',
      });
    });

    it('measures a tooltip and the text it covers, which axe cannot resolve', async () => {
      const fx = await harness.open('visual/hover-content-not-hoverable-ok.html');
      await fx.page.focus('#shipping-info');
      const passes: PassInput[] = [];
      fx.ctx.recordPass = (p) => passes.push(p);
      await createVisualEngine().run(fx.ctx);
      await fx.close();
      const reasons = Object.fromEntries(
        passes.map((p) => [p.selector, p.evidence?.data?.['background']]),
      );
      expect(reasons).toMatchObject({ '#shipping-tip': 'overlap', 'body > main > p': 'obscured' });
    });

    it('does not duplicate axe on plain solid-color contrast', async () => {
      expectNoFinding(await scan('static/low-contrast.html'), {
        ruleId: 'visual/contrast-over-background',
      });
    });

    it('finds a faint field border', async () => {
      const f = expectFinding(await scan('visual/non-text-contrast.html'), {
        ruleId: 'visual/non-text-contrast',
        selector: '#signup-email',
      });
      expect(f.tier).toBe('likely');
    });
  });

  describe('target size (2.5.8)', () => {
    it('finds the packed 12px pagination links', async () => {
      const findings = await scan('visual/target-size.html');
      for (const id of ['#page-1', '#page-2', '#page-3', '#page-4'])
        expectFinding(findings, { ruleId: 'visual/target-size', selector: id, tier: 'violation' });
    });

    it('turns configured equivalent targets into needs-review', async () => {
      const f = expectFinding(
        await scan('visual/target-size.html', { targetSizeEquivalent: ['#page-2'] }),
        {
          ruleId: 'visual/target-size',
          selector: '#page-2',
        },
      );
      expect(f.tier).toBe('needs-review');
      expect(f.question).toBeTruthy();
    });
  });

  describe('content on hover or focus (1.4.13)', () => {
    it('finds a covering tooltip that Escape does not close', async () => {
      const f = expectFinding(await scan('visual/hover-content-not-dismissible.html'), {
        ruleId: 'visual/hover-content-not-dismissible',
        selector: '#help-trigger',
      });
      expect(f.tier).toBe('violation');
    });

    it('finds a tooltip that vanishes when the pointer moves to it', async () => {
      const findings = await scan('visual/hover-content-not-hoverable.html');
      expectFinding(findings, {
        ruleId: 'visual/hover-content-not-hoverable',
        selector: '#shipping-info',
      });
      expectNoFinding(findings, { ruleId: 'visual/hover-content-not-dismissible' });
    });

    it('finds a tooltip that hides itself', async () => {
      const findings = await scan('visual/hover-content-not-persistent.html');
      expectFinding(findings, {
        ruleId: 'visual/hover-content-not-persistent',
        selector: '#password-help',
      });
      expectNoFinding(findings, { ruleId: 'visual/hover-content-not-hoverable' });
    });
  });

  describe('pause, stop, hide (2.2.2)', () => {
    const only = { motion: true, ...Object.fromEntries(OTHER_CHECKS.map((k) => [k, false])) };

    it('finds an endless CSS ticker with no pause control (likely)', async () => {
      const findings = await scan('visual/motion-without-pause.html', only);
      const f = expectFinding(findings, {
        ruleId: 'visual/motion-without-pause',
        selector: '#ticker-track',
      });
      expect(f.tier).toBe('likely');
      expect(f.wcag).toEqual(['2.2.2']);
      expect(f.evidence.data).toMatchObject({
        source: 'animation',
        infinite: true,
        pauseControl: null,
        stopsWithReducedMotion: false,
      });
      expect(findings).toHaveLength(1);
    });

    it('asks for review of a carousel that only reduced motion stops', async () => {
      const findings = await scan('visual/motion-without-pause-carousel.html', only);
      const f = expectFinding(findings, {
        ruleId: 'visual/motion-without-pause',
        selector: '#promo-carousel',
      });
      expect(f.tier).toBe('needs-review');
      expect(f.question).toMatch(/pause, stop or hide/);
      expect(f.evidence.data).toMatchObject({ source: 'mutation', stopsWithReducedMotion: true });
      expect(findings).toHaveLength(1);
    });

    it('accepts moving content whose pause buttons really stop it', async () => {
      expect(await scan('visual/motion-without-pause-ok.html', only)).toEqual([]);
    });

    it('leaves the scanned page alone: no extra pages, reduced motion still emulated', async () => {
      const fx = await harness.open('visual/motion-without-pause.html');
      await createVisualEngine().run(fx.ctx);
      expect(fx.page.context().pages()).toHaveLength(1);
      expect(
        await fx.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      await fx.close();
    });
  });

  describe('orientation (1.3.4)', () => {
    it('finds content hidden behind a rotate message in portrait and restores the viewport', async () => {
      const fx = await harness.open('visual/orientation-locked.html');
      const findings = await createVisualEngine().run(fx.ctx);
      const f = expectFinding(findings, {
        ruleId: 'visual/orientation-locked',
        selector: '#rotate-message',
      });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toEqual(['1.3.4']);
      expect(f.evidence.data).toMatchObject({
        kind: 'hidden-behind-message',
        lockedTo: 'landscape',
        portrait: '375x812',
      });
      expect(findings.map((x) => x.ruleId)).toEqual(['visual/orientation-locked']);
      expect(fx.page.viewportSize()).toEqual({ width: 1280, height: 800 });
      await fx.close();
    });
  });

  it('can turn checks off', async () => {
    expect(await scan('visual/target-size.html', { targetSize: false })).toEqual([]);
  });

  it('is deterministic: two runs give identical findings', async () => {
    const page = 'visual/contrast-over-image.html';
    const strip = (fs: Finding[]) =>
      fs.map((f) => ({ ...f, evidence: { ...f.evidence, screenshot: undefined } }));
    expect(strip(await scan(page))).toEqual(strip(await scan(page)));
  });
});
