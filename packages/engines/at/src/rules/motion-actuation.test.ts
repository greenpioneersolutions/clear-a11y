import { detectMotionActuation, motionActuationRule } from './motion-actuation.js';

describe('at/motion-actuation', () => {
  it('has rule metadata', () => {
    expect(motionActuationRule.id).toBe('at/motion-actuation');
    expect(motionActuationRule.wcag).toEqual(['2.5.4']);
    expect(motionActuationRule.tier).toBe('needs-review');
  });

  it('detects motion listeners registered on load', () => {
    expect(
      detectMotionActuation({ windowListeners: ['load', 'devicemotion', 'devicemotion'] }),
    ).toEqual(['devicemotion']);
    expect(detectMotionActuation({ windowListeners: ['deviceorientation'] })).toEqual([
      'deviceorientation',
    ]);
  });

  it('does not flag the correct pattern', () => {
    expect(detectMotionActuation({ windowListeners: ['resize', 'keydown'] })).toEqual([]);
  });
});
