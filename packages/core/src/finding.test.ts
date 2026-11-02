import { createFinding, findingId, FindingSchema } from './finding.js';

const base = {
  ruleId: 'keyboard/focus-order-backward',
  wcag: ['2.4.3'],
  tier: 'violation' as const,
  confidence: 0.95,
  engine: 'engine-keyboard',
  page: { url: 'http://localhost/form.html' },
  target: { selector: '#country' },
  message: 'Focus jumps backward from First name to Country.',
};

describe('createFinding', () => {
  it('fills defaults and a stable id', () => {
    const f = createFinding(base);
    expect(f.page).toEqual({
      url: 'http://localhost/form.html',
      state: 'default',
      viewport: 'desktop',
    });
    expect(f.evidence).toEqual({});
    expect(f.id).toBe(createFinding(base).id);
    expect(f.id).toMatch(/^[0-9a-f]{14}$/);
  });

  it('gives different ids to different targets or states', () => {
    const a = createFinding(base);
    const b = createFinding({ ...base, target: { selector: '#last-name' } });
    const c = createFinding({ ...base, page: { ...base.page, state: 'menu:open' } });
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it('rejects malformed success criteria and confidence', () => {
    expect(() => createFinding({ ...base, wcag: ['2.4'] })).toThrow();
    expect(() => createFinding({ ...base, confidence: 1.5 })).toThrow();
  });

  it('requires a question for needs-review findings', () => {
    expect(() => createFinding({ ...base, tier: 'needs-review' })).toThrow(/question/);
    const f = createFinding({ ...base, tier: 'needs-review', question: 'Is the order logical?' });
    expect(f.question).toBe('Is the order logical?');
  });

  it('round-trips through the schema', () => {
    const f = createFinding({
      ...base,
      evidence: { focusPath: [{ index: 0, selector: '#a', backward: true }] },
    });
    expect(FindingSchema.parse(JSON.parse(JSON.stringify(f)))).toEqual(f);
    expect(findingId(f)).toBe(f.id);
  });
});

describe('summarize', () => {
  it('counts by tier, engine and SC', async () => {
    const { summarize } = await import('./report.js');
    const s = summarize([
      createFinding(base),
      createFinding({ ...base, target: { selector: '#b' }, wcag: ['2.4.3', '1.3.2'] }),
    ]);
    expect(s).toEqual({
      total: 2,
      byTier: { violation: 2, likely: 0, 'needs-review': 0 },
      byEngine: { 'engine-keyboard': 2 },
      bySc: { '2.4.3': 2, '1.3.2': 1 },
    });
  });
});
