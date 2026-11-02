import { fileURLToPath } from 'node:url';
import { resolveConfig } from '@clear-a11y/core';
import {
  captureElement,
  createPageContext,
  ensureHelpers,
  gotoAndSettle,
  launchBrowser,
  memoryArtifactSink,
  startStaticServer,
} from '../src/index.js';

const siteDir = fileURLToPath(new URL('../../../fixtures/site', import.meta.url));

describe('browser (integration)', () => {
  it('opens a fixture, installs helpers and captures evidence', async () => {
    const server = await startStaticServer({ root: siteDir });
    const session = await launchBrowser();
    try {
      const { page, close } = await session.newPage({ name: 'desktop', width: 1280, height: 800 });
      await gotoAndSettle(page, server.url('keyboard/focus-order-backward.html'));
      await ensureHelpers(page);
      const result = await page.evaluate(() => {
        const h = window.__clearA11y!;
        const country = document.querySelector('#country')!;
        const label = document.querySelector('label')!;
        return {
          id: h.selector(country),
          label: h.selector(label),
          focusable: h.isFocusable(country),
          labelFocusable: h.isFocusable(label),
        };
      });
      expect(result.id).toBe('#country');
      expect(result.label).toBe('#first-name-field > label');
      expect(result.focusable).toBe(true);
      expect(result.labelFocusable).toBe(false);

      const artifacts = memoryArtifactSink();
      const ctx = createPageContext({
        page,
        url: page.url(),
        viewport: { name: 'desktop', width: 1280, height: 800 },
        config: resolveConfig(),
        artifacts,
      });
      expect(await captureElement(ctx, '#country', 'country')).toBe('memory:country.png');
      expect(await captureElement(ctx, '#does-not-exist', 'missing')).toBeUndefined();
      await close();
    } finally {
      await session.close();
      await server.close();
    }
  });
});

describe('gotoAndSettle (integration)', () => {
  it('really reloads when only the fragment is the same', async () => {
    const server = await startStaticServer({ root: siteDir });
    const session = await launchBrowser();
    try {
      const { page, close } = await session.newPage({ name: 'desktop', width: 1280, height: 800 });
      const url = server.url('blank.html') + '#/view';
      await gotoAndSettle(page, url);
      await page.evaluate(() => (document.body.dataset['leftover'] = 'yes'));
      await gotoAndSettle(page, url);
      expect(await page.evaluate(() => document.body.dataset['leftover'] ?? 'fresh')).toBe('fresh');
      expect(page.url()).toBe(url);
      await close();
    } finally {
      await session.close();
      await server.close();
    }
  });
});
