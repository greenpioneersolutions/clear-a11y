import { expectFinding, expectNoFinding, fixtureHarness } from '@clear-a11y/test-utils';
import { createStaticEngine } from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

const scan = async (path: string) => createStaticEngine().run((await harness.open(path)).ctx);

describe('engine-static (integration)', () => {
  it('reports nothing on the blank fixture page', async () => {
    expect(await scan('blank.html')).toEqual([]);
  });

  it('finds the missing alt text', async () => {
    const f = expectFinding(await scan('static/img-missing-alt.html'), {
      ruleId: 'static/image-alt',
      selector: '#hero',
    });
    expect(f.tier).toBe('violation');
    expect(f.evidence.screenshot).toMatch(/^memory:/);
  });

  it('accepts a placeholder as a name (a known axe gap other layers must cover)', async () => {
    expectNoFinding(await scan('static/form-missing-label.html'), { selector: '#email' });
  });

  it('finds low contrast, missing lang and nameless buttons', async () => {
    expectFinding(await scan('static/low-contrast.html'), {
      ruleId: 'static/color-contrast',
      selector: '#fine-print',
    });
    expectFinding(await scan('static/missing-lang.html'), { wcag: '3.1.1', selector: 'html' });
    expectFinding(await scan('static/button-no-name.html'), {
      wcag: '4.1.2',
      selector: '#close-notice',
    });
  });

  it('still runs on a page with a strict Content-Security-Policy', async () => {
    expectFinding(await scan('static/strict-csp.html'), {
      ruleId: 'static/image-alt',
      selector: '#gallery-photo',
    });
  });

  it('produces no violations on the correct-pattern page', async () => {
    expectNoFinding(await scan('static/ok.html'), { tier: 'violation' });
  });
});
