import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  expectFinding,
  expectNoFinding,
  fixtureHarness,
  fixturesExpectedDir,
} from '@clear-a11y/test-utils';
import { createStatesEngine } from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

const run = async (path: string) => createStatesEngine().run((await harness.open(path)).ctx);

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const correctPatternPages = walk(fixturesExpectedDir())
  .filter((f) => f.endsWith('.json'))
  .filter(
    (f) => (JSON.parse(readFileSync(f, 'utf-8')) as { correctPattern: boolean }).correctPattern,
  )
  .map((f) => relative(fixturesExpectedDir(), f).replace(/\.json$/, '.html'));

describe('engine-states (integration)', () => {
  it('reports nothing on the blank fixture page', async () => {
    expect(await run('blank.html')).toEqual([]);
  });

  it('does nothing in replayed states', async () => {
    const fx = await harness.open('states/form-errors.html', { state: 'form-empty#signup' });
    expect(await createStatesEngine().run(fx.ctx)).toEqual([]);
  });

  it('finds error text that is not associated with its fields (states/form-errors)', async () => {
    const findings = await run('states/form-errors.html');
    for (const selector of ['#email', '#password']) {
      const f = expectFinding(findings, { ruleId: 'states/error-not-associated', selector });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toContain('3.3.1');
      expect(f.page.state).toBe('form-empty#signup');
      expect(f.evidence.data?.['errorText']).toEqual(['Required']);
    }
  });

  it('finds unassociated errors reached by empty and by invalid submissions', async () => {
    const findings = await run('states/error-not-associated.html');
    expectFinding(findings, { ruleId: 'states/error-not-associated', selector: '#news-email' });
    const phone = expectFinding(findings, {
      ruleId: 'states/error-not-associated',
      selector: '#news-phone',
    });
    expect(phone.page.state).toBe('form-invalid#newsletter');
    expect(phone.evidence.data?.['filled']).toBe('!');
  });

  it('finds errors shown only by a red border', async () => {
    const findings = await run('states/error-not-in-text.html');
    for (const selector of ['#street', '#postcode']) {
      const f = expectFinding(findings, { ruleId: 'states/error-not-in-text', selector });
      expect(f.tier).toBe('likely');
    }
    expectNoFinding(findings, { ruleId: 'states/error-not-associated' });
  });

  it('finds aria-expanded that never updates', async () => {
    const findings = await run('states/expanded-state-mismatch.html');
    for (const selector of ['#acc-returns', '#acc-delivery']) {
      const f = expectFinding(findings, { ruleId: 'states/expanded-state-mismatch', selector });
      expect(f.tier).toBe('violation');
    }
  });

  it('leaves the missing-aria-expanded disclosure to the at layer', async () => {
    expect(await run('at/disclosure-no-state.html')).toEqual([]);
  });

  it('finds a select that loads another page when an option is chosen (3.2.2)', async () => {
    const findings = await run('states/context-change-on-input.html');
    const f = expectFinding(findings, {
      ruleId: 'states/context-change-on-input',
      selector: '#country',
    });
    expect(f.tier).toBe('likely');
    expect(f.wcag).toEqual(['3.2.2']);
    expect(f.evidence.data).toMatchObject({ change: 'navigation', control: 'select', value: 'nl' });
    expect(String(f.evidence.data?.['detail'])).toMatch(/\?country=nl$/);
    expect(findings.map((x) => `${x.ruleId} ${x.target.selector}`)).toEqual([
      'states/context-change-on-input #country',
    ]);
  });

  it.each(correctPatternPages)('reports nothing on the correct-pattern page %s', async (page) => {
    expectNoFinding(await run(page));
  });
});
