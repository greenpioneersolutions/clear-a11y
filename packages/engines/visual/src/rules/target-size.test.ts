import { detectTargetSize, targetSizeRule, type TargetSizeInput } from './target-size.js';

const t = (
  id: number,
  x: number,
  size: number,
  extra: Partial<TargetSizeInput> = {},
): TargetSizeInput => ({
  id,
  box: { x, y: 0, width: size, height: size },
  ancestors: [],
  ...extra,
});

describe('visual/target-size', () => {
  it('has rule metadata', () => {
    expect(targetSizeRule.id).toBe('visual/target-size');
    expect(targetSizeRule.wcag).toEqual(['2.5.8']);
  });

  it('detects 12px links packed together', () => {
    const out = detectTargetSize([t(1, 0, 12), t(2, 12, 12), t(3, 24, 12)]);
    expect(out.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(out.every((f) => f.tier === 'violation')).toBe(true);
  });

  it('does not flag 16px targets spaced so their circles do not intersect', () => {
    expect(detectTargetSize([t(1, 0, 16), t(2, 40, 16)])).toEqual([]);
  });

  it('does not flag targets that are 24px or larger', () => {
    expect(detectTargetSize([t(1, 0, 24), t(2, 24, 24)])).toEqual([]);
  });

  it('skips exempt targets but still counts them as neighbors', () => {
    const out = detectTargetSize([t(1, 0, 12, { exempt: 'inline' }), t(2, 14, 12)]);
    expect(out.map((f) => f.id)).toEqual([2]);
  });

  it('never compares a target with a target that contains it', () => {
    expect(detectTargetSize([t(1, 0, 100), t(2, 40, 12, { ancestors: [1] })])).toEqual([]);
  });

  it('downgrades configured equivalent targets to needs-review', () => {
    const out = detectTargetSize([t(1, 0, 12, { equivalent: true }), t(2, 12, 12)]);
    expect(out.find((f) => f.id === 1)?.tier).toBe('needs-review');
  });
});
