import {
  detectOrientationLock,
  isRotateMessage,
  orientationLockedRule,
  type OrientationMeasure,
} from './orientation-locked.js';

const portrait = (over: Partial<OrientationMeasure> = {}): OrientationMeasure => ({
  orientation: 'portrait',
  viewport: '375x812',
  textLength: 600,
  rotated: null,
  messages: [],
  ...over,
});
const landscape = (over: Partial<OrientationMeasure> = {}): OrientationMeasure => ({
  ...portrait(),
  orientation: 'landscape',
  viewport: '812x375',
  ...over,
});

const ROTATE = 'Please rotate your device to landscape to view the timetable.';

describe('visual/orientation-locked', () => {
  it('has rule metadata', () => {
    expect(orientationLockedRule.id).toBe('visual/orientation-locked');
    expect(orientationLockedRule.wcag).toEqual(['1.3.4']);
  });

  it('detects the barrier: content replaced by a rotate message in portrait (violation)', () => {
    const lock = detectOrientationLock(
      portrait({
        textLength: ROTATE.length,
        messages: [{ selector: '#rotate-message', text: ROTATE, coverage: 0.2 }],
      }),
      landscape(),
    );
    expect(lock).toMatchObject({
      kind: 'hidden-behind-message',
      tier: 'violation',
      lockedTo: 'landscape',
      selector: '#rotate-message',
    });
  });

  it('detects a rotate overlay that covers the content (violation)', () => {
    const lock = detectOrientationLock(
      portrait(),
      landscape({
        messages: [
          { selector: '#overlay p', text: 'Turn your phone to portrait mode', coverage: 0.9 },
        ],
      }),
    );
    expect(lock).toMatchObject({ kind: 'hidden-behind-message', lockedTo: 'portrait' });
  });

  it('detects a page turned by 90 degrees in one orientation (likely)', () => {
    expect(
      detectOrientationLock(portrait({ rotated: { selector: 'html', angle: 90 } }), landscape()),
    ).toMatchObject({ kind: 'rotated', tier: 'likely', selector: 'html' });
  });

  it('detects a page that is nearly empty in one orientation (likely)', () => {
    expect(detectOrientationLock(portrait({ textLength: 10 }), landscape())).toMatchObject({
      kind: 'content-hidden',
      tier: 'likely',
      selector: 'body',
    });
  });

  it('does not flag the correct pattern: a layout change with an optional rotate tip', () => {
    expect(
      detectOrientationLock(
        portrait({
          textLength: 650,
          messages: [
            {
              selector: '#rotate-tip',
              text: 'Tip: rotate your phone for a wider view.',
              coverage: 0,
            },
          ],
        }),
        landscape(),
      ),
    ).toBeNull();
    // A message shown in both orientations is not orientation-specific.
    const both = [{ selector: '#m', text: ROTATE, coverage: 0 }];
    expect(
      detectOrientationLock(
        portrait({ textLength: 70, messages: both }),
        landscape({ messages: both }),
      ),
    ).toBeNull();
    expect(detectOrientationLock(portrait({ textLength: 420 }), landscape())).toBeNull();
  });

  it('recognises rotate messages', () => {
    expect(isRotateMessage(ROTATE)).toBe(true);
    expect(isRotateMessage('This app only works in landscape.')).toBe(true);
    expect(isRotateMessage('Switch to portrait')).toBe(true);
    expect(isRotateMessage('Rotate the image with the handle.')).toBe(false);
    expect(isRotateMessage('Bus 12 timetable')).toBe(false);
  });
});
