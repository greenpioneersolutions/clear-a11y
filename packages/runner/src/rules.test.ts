import { RuleMetaSchema } from '@clear-a11y/core';
import { allRules } from './rules.js';

describe('allRules', () => {
  it('aggregates valid, unique rule metadata from every engine', () => {
    const rules = allRules();
    for (const r of rules) expect(() => RuleMetaSchema.parse(r)).not.toThrow();
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('keyboard/focus-order-backward');
    const engines = new Set(rules.map((r) => r.engine));
    for (const e of ['engine-keyboard', 'engine-visual', 'engine-at', 'engine-widgets'])
      expect(engines).toContain(e);
    expect([...ids].sort()).toEqual(ids);
  });
});
