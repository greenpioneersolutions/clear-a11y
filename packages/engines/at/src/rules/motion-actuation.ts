import type { RuleMeta } from '@clear-a11y/core';

export const motionActuationRule: RuleMeta = {
  id: 'at/motion-actuation',
  engine: 'engine-at',
  wcag: ['2.5.4'],
  tier: 'needs-review',
  title: 'Feature operated by device motion',
  description:
    'The page listens to device motion or orientation (devicemotion/deviceorientation) as soon as it loads. Features triggered by shaking or tilting are unusable for people whose device is mounted on a wheelchair, and are triggered by accident by people with tremors. WCAG requires a normal control for the same function and a way to turn motion off; whether those exist is for a human to confirm.',
  fix: 'Offer a button for every motion-triggered action, and only start listening to motion after the user turns the feature on (keep it off by default, with a setting to disable it).',
};

/** Listener types on window (and document). */
export interface MotionInput {
  windowListeners: string[];
}

const MOTION = ['devicemotion', 'deviceorientation', 'deviceorientationabsolute'];

/** Pure analysis for at/motion-actuation: the motion events the page listens to on load. */
export function detectMotionActuation(input: MotionInput): string[] {
  return [...new Set(input.windowListeners.filter((t) => MOTION.includes(t)))];
}
