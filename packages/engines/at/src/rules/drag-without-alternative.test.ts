import {
  detectDragWithoutAlternative,
  dragWithoutAlternativeRule,
  isDragTarget,
  type DragInput,
} from './drag-without-alternative.js';

const input = (over: Partial<DragInput> = {}): DragInput => ({
  draggable: false,
  listeners: [],
  nativeControl: false,
  alternative: false,
  ...over,
});

describe('at/drag-without-alternative', () => {
  it('has rule metadata', () => {
    expect(dragWithoutAlternativeRule.id).toBe('at/drag-without-alternative');
    expect(dragWithoutAlternativeRule.wcag).toEqual(['2.5.7', '2.5.1']);
    expect(dragWithoutAlternativeRule.tier).toBe('needs-review');
  });

  it('detects draggable items and swipe handlers with nothing else to press', () => {
    expect(detectDragWithoutAlternative(input({ draggable: true }))).toBe(true);
    expect(detectDragWithoutAlternative(input({ listeners: ['dragstart'] }))).toBe(true);
    expect(
      detectDragWithoutAlternative(
        input({ listeners: ['pointerdown', 'pointermove', 'pointerup'] }),
      ),
    ).toBe(true);
    expect(detectDragWithoutAlternative(input({ listeners: ['touchstart', 'touchmove'] }))).toBe(
      true,
    );
  });

  it('does not flag the correct pattern', () => {
    expect(detectDragWithoutAlternative(input({ draggable: true, alternative: true }))).toBe(false);
    expect(
      detectDragWithoutAlternative(input({ listeners: ['pointermove'], nativeControl: false })),
    ).toBe(false);
    expect(
      detectDragWithoutAlternative(
        input({ listeners: ['pointerdown', 'pointermove'], nativeControl: true }),
      ),
    ).toBe(false);
    expect(isDragTarget({ draggable: false, listeners: ['click', 'mousedown'] })).toBe(false);
  });
});
