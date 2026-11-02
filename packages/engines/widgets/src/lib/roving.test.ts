import { list, reachability } from './roving.js';

const items = [
  { selector: '#a', tabbable: true },
  { selector: '#b', tabbable: false },
  { selector: '#c', tabbable: false },
];

describe('reachability', () => {
  it('counts tabbable items and items reached with arrows', () => {
    expect(
      reachability(items, [
        { key: 'start', focused: '#a' },
        { key: 'ArrowRight', focused: '#b' },
        { key: 'ArrowRight', focused: '#outside' },
      ]),
    ).toEqual({ tabbable: ['#a'], byArrows: ['#b'], unreached: ['#c'] });
  });

  it('reports everything unreached when nothing is tabbable', () => {
    expect(
      reachability(
        items.map((i) => ({ ...i, tabbable: false })),
        [],
      ).unreached,
    ).toEqual(['#a', '#b', '#c']);
  });
});

describe('list', () => {
  it('quotes and truncates', () => {
    expect(list(['#a', '#b'])).toBe('"#a", "#b"');
    expect(list(['#a', '#b', '#c', '#d', '#e'])).toBe('"#a", "#b", "#c" and 2 more');
  });
});
