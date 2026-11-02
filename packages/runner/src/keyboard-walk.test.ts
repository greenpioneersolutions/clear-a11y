import type { WalkStop } from '@clear-a11y/engine-keyboard';
import { backwardJumpsOf } from './keyboard-walk.js';

const stop = (index: number, x: number, y: number): WalkStop => ({
  index,
  selector: `#s${index}`,
  name: '',
  role: 'textbox',
  tag: 'input',
  rect: { x, y, width: 100, height: 30 },
  client: { x, y, width: 100, height: 30 },
  visible: true,
  tiny: false,
  fixed: false,
  region: 'main',
  rtl: false,
  frame: false,
  inOverlay: false,
  hits: [],
});

describe('backwardJumpsOf', () => {
  it('flags a move back up the page', () => {
    expect(backwardJumpsOf([stop(0, 0, 0), stop(1, 0, 100), stop(2, 50, 0)])).toEqual([
      { from: 1, to: 2 },
    ]);
  });

  it('accepts reading order', () => {
    expect(backwardJumpsOf([stop(0, 0, 0), stop(1, 200, 0), stop(2, 0, 100)])).toEqual([]);
  });

  it('handles empty walks', () => {
    expect(backwardJumpsOf([])).toEqual([]);
  });
});
