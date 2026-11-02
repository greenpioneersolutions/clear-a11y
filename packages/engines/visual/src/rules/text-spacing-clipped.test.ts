import type { ClipMeasure } from '../lib/clipping.js';
import type { TextBox } from '../lib/geometry.js';
import { detectTextSpacingClipped, textSpacingClippedRule } from './text-spacing-clipped.js';

const clip = (scrollHeight: number): ClipMeasure => ({
  id: 1,
  selector: '#card-text',
  clientWidth: 260,
  clientHeight: 72,
  scrollWidth: 260,
  scrollHeight,
});
const text = (id: number, y: number, height: number): TextBox => ({
  id,
  selector: `#t${id}`,
  kind: 'text',
  rects: [{ x: 0, y, width: 200, height }],
  ancestors: [],
});

describe('visual/text-spacing-clipped', () => {
  it('has rule metadata', () => {
    expect(textSpacingClippedRule.id).toBe('visual/text-spacing-clipped');
    expect(textSpacingClippedRule.wcag).toEqual(['1.4.12']);
  });

  it('detects new clipping and new overlap', () => {
    const r = detectTextSpacingClipped(
      { clips: [clip(72)], boxes: [text(1, 0, 20), text(2, 24, 20)] },
      { clips: [clip(96)], boxes: [text(1, 0, 30), text(2, 24, 20)] },
    );
    expect(r.clipped.map((c) => c.after.selector)).toEqual(['#card-text']);
    expect(r.overlaps).toHaveLength(1);
  });

  it('does not flag a layout that adapts to the spacing', () => {
    const r = detectTextSpacingClipped(
      { clips: [clip(72)], boxes: [text(1, 0, 20), text(2, 24, 20)] },
      { clips: [clip(72)], boxes: [text(1, 0, 22), text(2, 26, 20)] },
    );
    expect(r).toEqual({ clipped: [], overlaps: [] });
  });
});
