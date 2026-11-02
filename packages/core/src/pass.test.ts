import { createFinding, type Finding } from './finding.js';
import { PassRecordSchema, resolveWithPasses, type PassRecord } from './pass.js';
import { ScanResultSchema, summarize, SCAN_RESULT_SCHEMA_VERSION } from './report.js';

const page = { url: 'http://localhost/visual/ok.html', state: 'default', viewport: 'desktop' };

const axeContrast = (overrides: Partial<Parameters<typeof createFinding>[0]> = {}): Finding =>
  createFinding({
    ruleId: 'static/color-contrast',
    wcag: ['1.4.3'],
    tier: 'needs-review',
    confidence: 0.5,
    engine: 'engine-static',
    page,
    target: { selector: 'h2' },
    message: 'Background could not be determined due to a background gradient.',
    question: 'Does this text have enough contrast?',
    ...overrides,
  });

const pass: PassRecord = {
  ruleId: 'visual/contrast-over-background',
  wcag: ['1.4.3'],
  engine: 'engine-visual',
  page,
  selector: 'h2',
  evidence: { data: { method: 'real-pixel', median: 9.1, p10: 7.4, threshold: 3 } },
};

describe('resolveWithPasses', () => {
  it('drops a needs-review finding that a deterministic pass covers and records why', () => {
    const f = axeContrast();
    const r = resolveWithPasses([f], [pass]);
    expect(r.findings).toEqual([]);
    expect(r.resolved).toEqual([{ finding: f, resolvedBy: pass }]);
  });

  it('never drops violation or likely findings', () => {
    const v = axeContrast({ tier: 'violation', question: undefined });
    const l = axeContrast({ tier: 'likely', question: undefined });
    expect(resolveWithPasses([v, l], [pass]).findings).toEqual([v, l]);
  });

  it('ignores passes from AI and persona engines', () => {
    const f = axeContrast();
    for (const engine of ['ai-judges', 'persona-keyboard']) {
      expect(resolveWithPasses([f], [{ ...pass, engine }]).findings).toEqual([f]);
    }
  });

  it('does not let an engine resolve its own findings', () => {
    const f = axeContrast({ engine: 'engine-visual' });
    expect(resolveWithPasses([f], [pass]).findings).toEqual([f]);
  });

  it('needs the same selector, page, state, viewport and an overlapping SC', () => {
    const f = axeContrast();
    const misses: PassRecord[] = [
      { ...pass, selector: 'h3' },
      { ...pass, page: { ...page, url: 'http://localhost/other.html' } },
      { ...pass, page: { ...page, state: 'dialog:open#x' } },
      { ...pass, page: { ...page, viewport: 'reflow' } },
      { ...pass, wcag: ['1.4.11'] },
    ];
    for (const p of misses) expect(resolveWithPasses([f], [p]).findings).toEqual([f]);
    expect(resolveWithPasses([f], [{ ...pass, wcag: ['1.4.11', '1.4.3'] }]).findings).toEqual([]);
  });

  it('validates pass records', () => {
    expect(PassRecordSchema.safeParse(pass).success).toBe(true);
    expect(PassRecordSchema.safeParse({ ...pass, wcag: [] }).success).toBe(false);
    expect(PassRecordSchema.safeParse({ ...pass, wcag: ['contrast'] }).success).toBe(false);
  });
});

describe('ScanResult with resolved findings', () => {
  it('summarizes and validates the optional resolved list', () => {
    const f = axeContrast();
    const { findings, resolved } = resolveWithPasses([f], [pass]);
    const summary = summarize(findings, resolved);
    expect(summary.resolved).toBe(1);
    expect(summarize(findings)).not.toHaveProperty('resolved');
    const result = {
      schemaVersion: SCAN_RESULT_SCHEMA_VERSION,
      tool: { name: 'clear-a11y', version: '0.0.0' },
      startedAt: 'a',
      finishedAt: 'b',
      targets: [],
      pages: [],
      findings,
      errors: [],
      summary,
      resolved,
    };
    expect(ScanResultSchema.parse(result).resolved).toHaveLength(1);
    const { resolved: _omit, ...older } = result;
    expect(ScanResultSchema.parse(older).resolved).toBeUndefined();
  });
});
