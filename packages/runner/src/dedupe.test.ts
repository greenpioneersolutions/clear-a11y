import { createFinding, resolveConfig } from '@clear-a11y/core';
import { dropStateDuplicates, finalizeFindings } from './dedupe.js';
import { createEngines, ENGINE_REGISTRY } from './engines.js';
import { withTimeout } from './timeout.js';

const f = (
  selector: string,
  tier: 'violation' | 'likely',
  engine = 'engine-static',
  confidence = 0.9,
) =>
  createFinding({
    ruleId: 'x/y',
    wcag: ['1.1.1'],
    tier,
    confidence,
    engine,
    page: { url: 'u' },
    target: { selector },
    message: 'm',
  });

describe('finalizeFindings', () => {
  it('dedupes by id keeping the most confident, applies tier policy, sorts by severity', () => {
    const out = finalizeFindings([
      f('b', 'likely'),
      f('a', 'violation', 'engine-static', 0.5),
      f('a', 'violation', 'engine-static', 0.9),
      f('c', 'violation', 'ai-alt'),
    ]);
    expect(out.map((x) => [x.target.selector, x.tier, x.confidence])).toEqual([
      ['a', 'violation', 0.9],
      ['b', 'likely', 0.9],
      ['c', 'likely', 0.9],
    ]);
  });
});

describe('dropStateDuplicates', () => {
  const at = (selector: string, state: string, ruleId = 'static/label', viewport = 'desktop') =>
    createFinding({
      ruleId,
      wcag: ['4.1.2'],
      tier: 'violation',
      confidence: 0.9,
      engine: 'engine-static',
      page: { url: 'u', state, viewport },
      target: { selector },
      message: 'm',
    });

  it('drops state findings already reported in the default state (same rule and selector)', () => {
    const out = dropStateDuplicates([
      at('#a', 'default'),
      at('#a', 'menu:open#nav'),
      at('#b', 'menu:open#nav'),
      at('#a', 'menu:open#nav', 'static/color-contrast'),
      at('#a', 'menu:open#nav', 'static/label', 'mobile'),
    ]);
    expect(
      out.map((f) => `${f.page.state} ${f.ruleId} ${f.target.selector} ${f.page.viewport}`),
    ).toEqual([
      'default static/label #a desktop',
      'menu:open#nav static/label #b desktop',
      'menu:open#nav static/color-contrast #a desktop',
      'menu:open#nav static/label #a mobile',
    ]);
  });
});

describe('createEngines', () => {
  it('honours config toggles and --only', () => {
    expect(createEngines(resolveConfig()).map((e) => e.name)).toContain('engine-static');
    expect(
      createEngines(resolveConfig({ engines: { static: false } })).map((e) => e.name),
    ).not.toContain('engine-static');
    expect(createEngines(resolveConfig(), ['static'])).toHaveLength(1);
    expect(ENGINE_REGISTRY.map((r) => r.key)).toContain('static');
  });

  it('registers the AI judges only when a provider is configured (default none sends nothing)', () => {
    const names = (config: Parameters<typeof resolveConfig>[0], only?: string[]) =>
      createEngines(resolveConfig(config), only).map((e) => e.name);
    expect(names({})).not.toContain('ai-judges');
    expect(names({}, ['ai'])).toEqual([]);
    expect(names({ ai: { provider: 'mock' } })).toContain('ai-judges');
    expect(names({ ai: { provider: 'mock' } }, ['ai'])).toEqual(['ai-judges']);
    expect(
      createEngines(resolveConfig({ ai: { provider: 'mock' } })).find((e) => e.name === 'ai-judges')
        ?.mutatesPage,
    ).toBe(false);
  });

  it('registers the persona engine only when persona tasks are configured', () => {
    const personas = {
      tasks: [
        {
          id: 'pay',
          goal: 'Pay',
          match: 'checkout',
          constraint: 'keyboard-only',
          steps: [{ name: 'Pay now' }],
          success: { text: 'Paid' },
        },
      ],
    };
    const names = (config: Parameters<typeof resolveConfig>[0], only?: string[]) =>
      createEngines(resolveConfig(config), only).map((e) => e.name);
    expect(names({})).not.toContain('persona');
    expect(names({ personas: { tasks: [] } })).not.toContain('persona');
    expect(names({ personas })).toContain('persona');
    expect(names({ personas }, ['personas'])).toEqual(['persona']);
    const engine = createEngines(resolveConfig({ personas }), ['personas'])[0]!;
    expect(engine.mutatesPage).toBe(true);
    expect(() =>
      createEngines(resolveConfig({ personas: { tasks: [{ id: 'x' }] } }), ['personas']),
    ).toThrow(/Invalid personas config/);
  });

  it('fails fast with the env var name when a remote provider has no key', () => {
    expect(() =>
      createEngines(
        resolveConfig({
          ai: { provider: 'anthropic', apiKeyEnv: 'CLEAR_A11Y_TEST_KEY_THAT_IS_NOT_SET' },
        }),
      ),
    ).toThrow(/CLEAR_A11Y_TEST_KEY_THAT_IS_NOT_SET/);
  });
});

describe('tier policy for AI engines', () => {
  it('never lets an ai-* engine produce a violation on its own', () => {
    const forged = f('#team-photo', 'violation', 'ai-alt-text');
    expect(finalizeFindings([forged])[0]!.tier).toBe('likely');
    // A deterministic violation on the same target, page and SC confirms it.
    const confirmed = finalizeFindings([forged, { ...f('#team-photo', 'violation'), id: 'd' }]);
    expect(confirmed.find((x) => x.engine === 'ai-alt-text')!.tier).toBe('violation');
  });
});

describe('withTimeout', () => {
  it('rejects slow work', async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, 'slow')).rejects.toThrow(
      /slow timed out/,
    );
    await expect(withTimeout(Promise.resolve(1), 10, 'fast')).resolves.toBe(1);
  });
});
