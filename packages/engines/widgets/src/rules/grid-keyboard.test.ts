import { evaluateGrid, gridKeyboardRule, type GridCell } from './grid-keyboard.js';

const cell = (n: number, tabbable: boolean, interactive = true): GridCell => ({
  selector: `#cell-${n}`,
  tabbable,
  interactive,
  ...(interactive ? { control: `#day-${n}` } : {}),
});
const still = [
  { key: 'start', focused: '#cell-1' },
  { key: 'ArrowRight', focused: '#cell-1' },
  { key: 'ArrowDown', focused: '#cell-1' },
];

describe('widgets/grid-keyboard', () => {
  it('has rule metadata', () => {
    expect(gridKeyboardRule.id).toBe('widgets/grid-keyboard');
    expect(gridKeyboardRule.wcag).toEqual(['2.1.1']);
  });

  it('does not flag a grid where the arrow keys move focus', () => {
    expect(
      evaluateGrid({
        grid: '#g',
        cells: [cell(1, true), cell(2, false), cell(3, false)],
        steps: [
          { key: 'start', focused: '#cell-1' },
          { key: 'ArrowRight', focused: '#cell-2' },
        ],
      }),
    ).toEqual([]);
  });

  it('flags controls in cells that neither Tab nor arrows reach', () => {
    const [p] = evaluateGrid({
      grid: '#g',
      cells: [cell(1, true), cell(2, false), cell(3, false)],
      steps: still,
    });
    expect(p).toMatchObject({ tier: 'violation', selector: '#g', wcag: ['2.1.1'] });
    expect(p?.message).toContain('#day-2');
  });

  it('asks for review for Tab-only grids, grids without a focusable cell and static cells', () => {
    expect(
      evaluateGrid({ grid: '#g', cells: [cell(1, true), cell(2, true)], steps: still })[0]?.tier,
    ).toBe('needs-review');
    expect(
      evaluateGrid({
        grid: '#g',
        cells: [cell(1, false, false), cell(2, false, false)],
        steps: [],
      })[0]?.tier,
    ).toBe('needs-review');
    expect(
      evaluateGrid({ grid: '#g', cells: [cell(1, true), cell(2, false, false)], steps: still })[0]
        ?.tier,
    ).toBe('needs-review');
  });
});
