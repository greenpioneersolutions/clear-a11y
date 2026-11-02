import type { TextBox } from '../lib/geometry.js';
import { detectTextOverlap, overlapWcag, textOverlapRule } from './text-overlap.js';

const text = (id: number, y: number, height: number, kind: TextBox['kind'] = 'text'): TextBox => ({
  id,
  selector: `#t${id}`,
  kind,
  rects: [{ x: 0, y, width: 200, height }],
  ancestors: [],
});

describe('visual/text-overlap', () => {
  it('has rule metadata', () => {
    expect(textOverlapRule.id).toBe('visual/text-overlap');
    expect(textOverlapRule.wcag).toEqual(['1.4.4', '1.4.10']);
    expect(overlapWcag('reflow')).toEqual(['1.4.10']);
    expect(overlapWcag('text-only')).toEqual(['1.4.4']);
  });

  it('detects a heading that runs into the next paragraph after resize', () => {
    const before = [text(1, 0, 24), text(2, 40, 20)];
    const after = [text(1, 0, 60), text(2, 40, 20)];
    expect(detectTextOverlap(before, after).map(({ a, b }) => [a.id, b.id])).toEqual([[1, 2]]);
  });

  it('detects text running into a control', () => {
    const before = [text(1, 0, 24), text(2, 40, 30, 'control')];
    const after = [text(1, 0, 60), text(2, 40, 30, 'control')];
    expect(detectTextOverlap(before, after)).toHaveLength(1);
  });

  it('does not flag text that flows instead of overlapping', () => {
    expect(
      detectTextOverlap([text(1, 0, 24), text(2, 40, 20)], [text(1, 0, 48), text(2, 60, 20)]),
    ).toEqual([]);
  });
});
