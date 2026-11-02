import { createFinding } from './finding.js';
import { applyTierPolicy, enforceTierPolicy, isAiEngine, tierAtLeast } from './tiers.js';

const make = (engine: string, tier: 'violation' | 'likely', selector = 'img') =>
  createFinding({
    ruleId: 'x/y',
    wcag: ['1.1.1'],
    tier,
    confidence: 0.9,
    engine,
    page: { url: 'u' },
    target: { selector },
    message: 'm',
  });

describe('tier policy', () => {
  it('identifies AI engines', () => {
    expect(isAiEngine('ai-alt-text')).toBe(true);
    expect(isAiEngine('persona-keyboard')).toBe(true);
    expect(isAiEngine('engine-static')).toBe(false);
  });

  it('downgrades an unconfirmed AI violation to likely', () => {
    expect(enforceTierPolicy(make('ai-alt-text', 'violation')).tier).toBe('likely');
  });

  it('keeps an AI violation confirmed by a deterministic violation on the same target', () => {
    const det = make('engine-static', 'violation');
    expect(enforceTierPolicy(make('ai-alt-text', 'violation'), [det]).tier).toBe('violation');
    expect(
      enforceTierPolicy(make('ai-alt-text', 'violation'), [make('engine-static', 'violation', 'p')])
        .tier,
    ).toBe('likely');
  });

  it('never touches deterministic findings', () => {
    const findings = applyTierPolicy([
      make('engine-static', 'violation'),
      make('ai-x', 'violation', 'h1'),
    ]);
    expect(findings.map((f) => f.tier)).toEqual(['violation', 'likely']);
  });

  it('compares tiers by severity', () => {
    expect(tierAtLeast('violation', 'likely')).toBe(true);
    expect(tierAtLeast('needs-review', 'violation')).toBe(false);
  });
});
