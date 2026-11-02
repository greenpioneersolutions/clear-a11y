import { fixtureHarness, openFixture } from '../src/index.js';

describe('openFixture (integration)', () => {
  it('opens a fixture page with a ready PageContext', async () => {
    const fx = await openFixture('blank.html');
    try {
      expect(fx.ctx.state).toBe('default');
      expect(fx.ctx.config.ai.provider).toBe('none');
      expect(await fx.page.title()).toBe('Blank page');
    } finally {
      await fx.close();
    }
  });

  it('replays a state before handing over the context', async () => {
    const harness = fixtureHarness();
    try {
      const fx = await harness.open('states/modal-focus.html', {
        state: 'dialog:open#settings-dialog',
        stateMeta: {
          kind: 'dialog',
          triggerSelector: '#open-settings',
          replay: (p) => p.click('#open-settings'),
        },
      });
      expect(await fx.page.isVisible('#settings-dialog')).toBe(true);
      expect(fx.ctx.stateMeta?.kind).toBe('dialog');
    } finally {
      await harness.close();
    }
  });
});
