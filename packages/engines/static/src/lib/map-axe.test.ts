import type { AxeResults } from 'axe-core';
import { axeTargetToSelector, mapAxeResults, wcagFromTags } from './map-axe.js';

const page = { url: 'http://127.0.0.1/x.html', state: 'default', viewport: 'desktop' };

const rule = (
  id: string,
  tags: string[],
  nodes: Array<{ target: string[]; html: string; failureSummary?: string }>,
) => ({
  id,
  impact: 'serious' as const,
  tags,
  description: `${id} description`,
  help: `${id} help`,
  helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`,
  nodes: nodes.map((n) => ({ ...n, impact: 'serious' as const, any: [], all: [], none: [] })),
});

describe('mapAxeResults', () => {
  it('maps violations to violation findings with WCAG SCs from tags', () => {
    const results = {
      violations: [
        rule(
          'image-alt',
          ['cat.text-alternatives', 'wcag2a', 'wcag111'],
          [
            {
              target: ['#hero'],
              html: '<img id="hero">',
              failureSummary: 'Fix any of the following:\n  Element does not have an alt attribute',
            },
          ],
        ),
      ],
      incomplete: [],
    } as unknown as AxeResults;
    const [f] = mapAxeResults(results, page);
    expect(f).toMatchObject({
      ruleId: 'static/image-alt',
      wcag: ['1.1.1'],
      tier: 'violation',
      engine: 'engine-static',
      target: { selector: '#hero' },
      message: 'image-alt help: Element does not have an alt attribute',
      evidence: { html: '<img id="hero">', data: { axeRule: 'image-alt', impact: 'serious' } },
    });
    expect(f?.fix).toContain('https://dequeuniversity.com/rules/axe/4.14/image-alt');
  });

  it('maps incomplete results to needs-review with a yes/no question', () => {
    const results = {
      violations: [],
      incomplete: [
        rule('color-contrast', ['wcag2aa', 'wcag143'], [{ target: ['#hero-title'], html: '<h1>' }]),
      ],
    } as unknown as AxeResults;
    const [f] = mapAxeResults(results, page);
    expect(f?.tier).toBe('needs-review');
    expect(f?.question).toMatch(/4\.5:1/);
  });

  it('drops rules without WCAG success criteria', () => {
    const results = {
      violations: [rule('region', ['best-practice'], [{ target: ['p'], html: '<p>' }])],
      incomplete: [],
    } as unknown as AxeResults;
    expect(mapAxeResults(results, page)).toEqual([]);
  });
});

describe('helpers', () => {
  it('flattens shadow and frame targets', () => {
    expect(axeTargetToSelector(['iframe', ['my-el', 'button']] as never)).toBe(
      'iframe >>> my-el >>> button',
    );
  });

  it('dedupes SCs', () => {
    expect(wcagFromTags(['wcag2a', 'wcag412', 'wcag412', 'wcag131'])).toEqual(['4.1.2', '1.3.1']);
  });
});
