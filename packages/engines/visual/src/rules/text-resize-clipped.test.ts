import type { ClipMeasure } from '../lib/clipping.js';
import { detectTextResizeClipped, textResizeClippedRule } from './text-resize-clipped.js';

const m = (scrollHeight: number): ClipMeasure => ({
  id: 1,
  selector: '#buy',
  clientWidth: 120,
  clientHeight: 32,
  scrollWidth: 120,
  scrollHeight,
});

describe('visual/text-resize-clipped', () => {
  it('has rule metadata', () => {
    expect(textResizeClippedRule.id).toBe('visual/text-resize-clipped');
    expect(textResizeClippedRule.wcag).toEqual(['1.4.4']);
  });

  it('detects text clipped after resize: violation for zoom, likely for text-only', () => {
    expect(detectTextResizeClipped([m(32)], [m(64)], 'zoom')[0]?.tier).toBe('violation');
    expect(detectTextResizeClipped([m(32)], [m(64)], 'text-only')[0]?.tier).toBe('likely');
  });

  it('does not flag a box that still fits', () => {
    expect(detectTextResizeClipped([m(32)], [m(32)], 'zoom')).toEqual([]);
  });
});
