import { detectCycle, isStrictSubset } from './trap.js';

describe('detectCycle', () => {
  it('finds no cycle when focus leaves the document', () => {
    expect(detectCycle(['#a', '#b', '#c', null])).toBeNull();
    expect(detectCycle([])).toBeNull();
  });

  it('finds a single element that keeps focus', () => {
    expect(detectCycle(['#before', '#editor', '#editor'])).toEqual({
      start: 1,
      end: 2,
      members: ['#editor'],
    });
  });

  it('finds a script-enforced loop over several stops', () => {
    expect(detectCycle(['#x', '#d1', '#d2', '#d3', '#d1'])).toEqual({
      start: 1,
      end: 4,
      members: ['#d1', '#d2', '#d3'],
    });
  });
});

describe('isStrictSubset', () => {
  it('compares the cycle with the tabbable count', () => {
    const cycle = { start: 1, end: 2, members: ['#editor'] };
    expect(isStrictSubset(cycle, 3)).toBe(true);
    expect(isStrictSubset(cycle, 1)).toBe(false);
  });
});
