import { resolveConfig } from './config.js';
import { layerOf } from './rule.js';

describe('config', () => {
  it('defaults to no AI provider and all deterministic engines on', () => {
    const c = resolveConfig();
    expect(c.ai.provider).toBe('none');
    expect(c.at.guidepup).toBe(false);
    expect(c.engines).toEqual({
      static: true,
      states: true,
      keyboard: true,
      visual: true,
      at: true,
      widgets: true,
    });
    expect(c.viewports[0]).toEqual({ name: 'desktop', width: 1280, height: 800 });
    expect(c.failOn).toBe('violation');
    expect(c.crawl.enabled).toBe(false);
  });

  it('merges partial input', () => {
    const c = resolveConfig({ engines: { visual: false }, ai: { provider: 'mock' } });
    expect(c.engines.visual).toBe(false);
    expect(c.engines.keyboard).toBe(true);
    expect(c.ai.provider).toBe('mock');
  });

  it('rejects unknown providers', () => {
    expect(() => resolveConfig({ ai: { provider: 'claude-subscription' as never } })).toThrow();
  });
});

describe('layerOf', () => {
  it('maps engine names to layers', () => {
    expect(layerOf('engine-keyboard')).toBe('keyboard');
    expect(layerOf('ai-alt-text')).toBe('ai');
    expect(layerOf('persona-keyboard')).toBe('persona');
    expect(layerOf('repo-eslint')).toBe('repo');
  });
});

describe('per-engine sections', () => {
  it('keeps engine-specific options for engines to validate', () => {
    const c = resolveConfig({
      visual: { reflowWidth: 320 },
      at: { guidepup: false, liveRegionWaitMs: 500 },
    });
    expect(c.visual).toEqual({ reflowWidth: 320 });
    expect(c.keyboard).toEqual({});
    expect(c.at).toEqual({ guidepup: false, liveRegionWaitMs: 500 });
  });
});

describe('RuleMetaSchema', () => {
  it('accepts single and multi-segment rule ids', async () => {
    const { RuleMetaSchema } = await import('./rule.js');
    const base = {
      engine: 'e',
      wcag: ['1.1.1'],
      tier: 'likely',
      title: 't',
      description: 'd',
      fix: 'f',
    };
    expect(RuleMetaSchema.safeParse({ ...base, id: 'keyboard/focus-order-backward' }).success).toBe(
      true,
    );
    expect(RuleMetaSchema.safeParse({ ...base, id: 'repo/jsx-a11y/alt-text' }).success).toBe(true);
    expect(RuleMetaSchema.safeParse({ ...base, id: 'no-slash' }).success).toBe(false);
  });
});
