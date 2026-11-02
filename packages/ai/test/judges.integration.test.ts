import { expectFinding, expectNoFinding, fixtureHarness } from '@clear-a11y/test-utils';
import { createAiEngine, noneProvider } from '../src/index.js';
import { expectAiTiers, recordedProvider, runJudges } from './helpers.js';
import { resolveConfig } from '@clear-a11y/core';

const harness = fixtureHarness();
afterAll(() => harness.close());

/** Opens blank.html and replaces its content: judge-specific pages without new benchmark pages. */
async function page(html: string) {
  const fx = await harness.open('blank.html');
  await fx.page.setContent(
    `<!doctype html><html lang="en"><head><title>Test page</title></head><body><main>${html}</main></body></html>`,
  );
  return fx;
}

describe('AI judges against fixtures (mock provider, synthetic recordings)', () => {
  it('sends nothing and finds nothing with the none provider', async () => {
    const fx = await harness.open('ai/alt-filename.html');
    const engine = createAiEngine(resolveConfig(), noneProvider);
    expect(await engine.run(fx.ctx)).toEqual([]);
    expect(engine.calls()).toBe(0);
  });

  it('alt-text: flags the file-name alt and attaches a screenshot crop to the request', async () => {
    const provider = recordedProvider();
    const fx = await harness.open('ai/alt-filename.html');
    const findings = await runJudges(fx.ctx, provider, ['alt-text']);
    const f = expectFinding(findings, { ruleId: 'ai/alt-text', selector: '#team-photo' });
    expect(f).toMatchObject({ tier: 'likely', engine: 'ai-alt-text', wcag: ['1.1.1'] });
    expect(f.evidence.data).toMatchObject({ verdict: 'fail', provider: 'mock' });
    const req = provider.requests[0]!;
    expect(req.images?.[0]?.mediaType).toBe('image/png');
    expect(req.images?.[0]?.data.length).toBeGreaterThan(100);
    expectAiTiers(findings);

    const ok = await runJudges((await harness.open('ai/ok.html')).ctx, recordedProvider(), [
      'alt-text',
    ]);
    expect(ok).toEqual([]);
  });

  it('alt-text: honors ai.images=false', async () => {
    const provider = recordedProvider();
    const fx = await harness.open('ai/alt-filename.html');
    await runJudges(fx.ctx, provider, ['alt-text'], { images: false });
    expect(provider.requests[0]!.images).toBeUndefined();
  });

  it('link-purpose: flags the identical "Click here" links and nothing on the correct page', async () => {
    const fx = await harness.open('ai/link-purpose.html');
    const findings = await runJudges(fx.ctx, recordedProvider(), ['link-purpose']);
    for (const selector of ['#link-1', '#link-2', '#link-3']) {
      expectFinding(findings, { ruleId: 'ai/link-purpose', selector, tier: 'likely' });
    }
    expectAiTiers(findings);
    const provider = recordedProvider();
    expect(
      await runJudges((await harness.open('ai/ok.html')).ctx, provider, ['link-purpose']),
    ).toEqual([]);
    expect(provider.requests).toHaveLength(0); // clear link texts are not even sent
  });

  it('label-in-name: asks only about ambiguous controls', async () => {
    const provider = recordedProvider();
    const fx = await page(`
      <button id="qty" aria-label="Quantity 2">Qty 2</button>
      <button id="close" aria-label="Close dialog">×</button>
      <button id="search" aria-label="Search products">Search</button>`);
    const findings = await runJudges(fx.ctx, provider, ['label-in-name']);
    expect(provider.requests).toHaveLength(2);
    expectFinding(findings, { ruleId: 'ai/label-in-name', selector: '#qty', wcag: '2.5.3' });
    expectNoFinding(findings, { selector: '#close' });
    expectNoFinding(findings, { selector: '#search' });
  });

  it('descriptive headings: flags duplicated vague headings, not descriptive ones', async () => {
    const fx = await page(`
      <h1>Order summary</h1>
      <h2 id="h-ship">Details</h2><p>Ships in two days by courier.</p>
      <h2 id="h-ret">Details</h2><p>Return within 30 days for a refund.</p>`);
    const findings = await runJudges(fx.ctx, recordedProvider(), ['descriptive-headings-labels']);
    expectFinding(findings, { ruleId: 'ai/descriptive-headings-labels', selector: '#h-ship' });
    expectFinding(findings, { ruleId: 'ai/descriptive-headings-labels', selector: '#h-ret' });
    expectAiTiers(findings);

    const ok = await page('<h1>Order summary</h1><h2>Shipping details</h2><h2>Return details</h2>');
    expect(await runJudges(ok.ctx, recordedProvider(), ['descriptive-headings-labels'])).toEqual(
      [],
    );
  });

  it('error-clarity: runs only in form-invalid states', async () => {
    const html = `
      <form><label for="d">Delivery date</label>
      <input id="d" pattern="\\d{2}/\\d{2}/\\d{4}" aria-invalid="true" aria-describedby="d-err" />
      <span id="d-err">Error 42</span></form>`;
    const fx = await page(html);
    expect(await runJudges(fx.ctx, recordedProvider(), ['error-clarity'])).toEqual([]);
    const invalid = { ...fx.ctx, state: 'form-invalid#form', stateMeta: { kind: 'form-invalid' } };
    const findings = await runJudges(invalid, recordedProvider(), ['error-clarity']);
    const f = expectFinding(findings, { ruleId: 'ai/error-clarity', selector: '#d-err' });
    expect(f.page.state).toBe('form-invalid#form');
    expect(f.wcag).toEqual(['3.3.3']);
  });

  it('color-only: flags an inline link marked only by color, not an underlined one', async () => {
    const css =
      '<style>body{color:rgb(26,26,26)} a{color:rgb(26,79,139);text-decoration:none}</style>';
    const fx = await page(
      `${css}<p>By ordering you accept our <a id="terms" href="#t">terms of sale</a> and the delivery conditions below.</p>`,
    );
    const findings = await runJudges(fx.ctx, recordedProvider(), ['color-only']);
    const f = expectFinding(findings, { ruleId: 'ai/color-only', selector: '#terms' });
    expect(f.tier).toBe('likely');

    const provider = recordedProvider();
    const ok = await page(
      `<p>By ordering you accept our <a href="#t">terms of sale</a> and the delivery conditions below.</p>`,
    );
    expect(await runJudges(ok.ctx, provider, ['color-only'])).toEqual([]);
    expect(provider.requests).toHaveLength(0);
  });

  it('focus-order: sends the focus path of a non-linear page, nothing for a linear one', async () => {
    const fx = await harness.open('keyboard/focus-order-backward.html');
    const findings = await runJudges(fx.ctx, recordedProvider(), ['focus-order']);
    const [f] = findings;
    expect(f).toMatchObject({
      ruleId: 'ai/focus-order',
      engine: 'ai-focus-order',
      wcag: ['2.4.3'],
    });
    expect(f!.evidence.focusPath?.some((s) => s.backward)).toBe(true);

    const provider = recordedProvider();
    const linear = await page(
      '<input aria-label="a"><br><input aria-label="b"><br><input aria-label="c">',
    );
    expect(await runJudges(linear.ctx, provider, ['focus-order'])).toEqual([]);
    expect(provider.requests).toHaveLength(0);
  });

  it('caps candidates per judge', async () => {
    const provider = recordedProvider();
    const links = Array.from(
      { length: 12 },
      (_, i) => `<li><a href="#x${i}">Click here</a></li>`,
    ).join('');
    const fx = await page(`<h1>Links</h1><ul>${links}</ul>`);
    await runJudges(fx.ctx, provider, ['link-purpose'], { maxCandidatesPerJudge: 3 });
    expect(provider.requests).toHaveLength(3);
  });
});
