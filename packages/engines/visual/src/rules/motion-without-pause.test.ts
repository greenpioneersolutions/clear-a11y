import {
  isMovingContent,
  isPauseControlName,
  motionVerdict,
  motionWithoutPauseRule,
  pickMoving,
  type MotionEntry,
} from './motion-without-pause.js';

const entry = (over: Partial<MotionEntry> = {}): MotionEntry => ({
  id: 0,
  ancestors: [],
  selector: '#ticker',
  source: 'animation',
  infinite: true,
  activeMs: null,
  bursts: 0,
  mutations: 0,
  spanMs: 0,
  inCarousel: false,
  width: 600,
  height: 40,
  progressLike: false,
  otherText: 400,
  ...over,
});

describe('visual/motion-without-pause', () => {
  it('has rule metadata', () => {
    expect(motionWithoutPauseRule.id).toBe('visual/motion-without-pause');
    expect(motionWithoutPauseRule.wcag).toEqual(['2.2.2']);
  });

  describe('isMovingContent', () => {
    it('detects the barrier: an endless or long animation', () => {
      expect(isMovingContent(entry(), 2000)).toBe(true);
      expect(isMovingContent(entry({ infinite: false, activeMs: 12_000 }), 2000)).toBe(true);
    });

    it('ignores animations of five seconds or less (the SC allows them)', () => {
      expect(isMovingContent(entry({ infinite: false, activeMs: 5000 }), 2000)).toBe(false);
    });

    it('detects repeated script changes, continuous changes, and a carousel turning once', () => {
      const m = { source: 'mutation' as const, infinite: false };
      expect(isMovingContent(entry({ ...m, bursts: 2, mutations: 2 }), 2000)).toBe(true);
      expect(isMovingContent(entry({ ...m, bursts: 1, mutations: 60, spanMs: 1900 }), 2000)).toBe(
        true,
      );
      expect(
        isMovingContent(entry({ ...m, bursts: 1, mutations: 2, inCarousel: true }), 5000),
      ).toBe(true);
      // One change outside a carousel (late rendering, a one-off update) is not motion.
      expect(isMovingContent(entry({ ...m, bursts: 1, mutations: 3, spanMs: 20 }), 2000)).toBe(
        false,
      );
    });

    it('exempts loading indicators, tiny dots and content shown on its own', () => {
      expect(isMovingContent(entry({ progressLike: true }), 2000)).toBe(false);
      expect(isMovingContent(entry({ width: 10, height: 10 }), 2000)).toBe(false);
      expect(isMovingContent(entry({ otherText: 0 }), 2000)).toBe(false);
    });
  });

  it('keeps only the innermost of nested moving elements', () => {
    const picked = pickMoving(
      [
        entry({ id: 0, selector: '#wrap', source: 'mutation', bursts: 3, infinite: false }),
        entry({ id: 1, selector: '#ticker', ancestors: [0] }),
        entry({ id: 2, selector: '#static', infinite: false, activeMs: 300 }),
      ],
      2000,
    );
    expect(picked.map((e) => e.selector)).toEqual(['#ticker']);
  });

  describe('motionVerdict', () => {
    it('is likely without a control or reduced-motion support', () => {
      expect(motionVerdict({ control: 'none', stopsWithReducedMotion: false })).toBe('likely');
    });

    it('asks for review when only reduced motion stops it, or the control may not work', () => {
      expect(motionVerdict({ control: 'none', stopsWithReducedMotion: true })).toBe('needs-review');
      expect(motionVerdict({ control: 'unverified', stopsWithReducedMotion: false })).toBe(
        'needs-review',
      );
    });

    it('does not flag the correct pattern: a control that really stops it', () => {
      expect(motionVerdict({ control: 'works', stopsWithReducedMotion: false })).toBeNull();
    });
  });

  it('recognises pause, stop and hide controls by name', () => {
    for (const name of ['Pause', 'Pause slideshow', 'Stop animation', 'Hide ticker', 'Close']) {
      expect(isPauseControlName(name)).toBe(true);
    }
    expect(isPauseControlName('Autoplay: on')).toBe(true);
    expect(isPauseControlName('Next slide')).toBe(false);
    expect(isPauseControlName('Read more')).toBe(false);
  });
});
