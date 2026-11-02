import {
  detectReflowTwoDimensional,
  REFLOW_TWO_DIMENSIONAL_QUESTION,
  reflowTwoDimensionalRule,
} from './reflow-two-dimensional.js';

describe('visual/reflow-two-dimensional', () => {
  it('has rule metadata and a yes/no question', () => {
    expect(reflowTwoDimensionalRule.id).toBe('visual/reflow-two-dimensional');
    expect(reflowTwoDimensionalRule.wcag).toEqual(['1.4.10']);
    expect(reflowTwoDimensionalRule.tier).toBe('needs-review');
    expect(REFLOW_TWO_DIMENSIONAL_QUESTION).toMatch(/\?$/);
  });

  it('flags a horizontally scrolling region of ordinary content', () => {
    expect(detectReflowTwoDimensional({ clientWidth: 288, scrollWidth: 900, exempt: false })).toBe(
      true,
    );
  });

  it('does not flag a scrolling data table or a region that fits', () => {
    expect(detectReflowTwoDimensional({ clientWidth: 288, scrollWidth: 900, exempt: true })).toBe(
      false,
    );
    expect(detectReflowTwoDimensional({ clientWidth: 288, scrollWidth: 289, exempt: false })).toBe(
      false,
    );
  });
});
