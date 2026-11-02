import type { RuleMeta, Tier } from '@clear-a11y/core';
import { failsSpacing, isUndersized, type Box } from '../lib/geometry.js';

export const targetSizeRule: RuleMeta = {
  id: 'visual/target-size',
  engine: 'engine-visual',
  wcag: ['2.5.8'],
  tier: 'violation',
  title: 'Target smaller than 24 by 24 CSS px without spacing',
  description:
    'A link, button or other control is smaller than 24 by 24 CSS px and too close to another control: a 24px circle centered on it touches a neighbor. People with tremors, limited dexterity or large fingers hit the wrong target.',
  fix: 'Make the target at least 24 by 24 CSS px (padding counts: min-width and min-height of 24px), or space small targets so 24px circles centered on them do not overlap each other or another target.',
};

export interface TargetSizeInput {
  id: number;
  box: Box;
  /** Ids of targets that contain this one (never compared with each other). */
  ancestors: number[];
  /** SC exception that applies: inline in a sentence, or size set by the user agent. */
  exempt?: 'inline' | 'user-agent';
  /** Configured as having an equivalent, compliant control elsewhere on the page. */
  equivalent?: boolean;
}

export interface TargetSizeFailure {
  id: number;
  tier: Tier;
}

/**
 * Pure analysis for visual/target-size (SC 2.5.8): undersized targets that fail the spacing
 * exception. Exempt targets still count as neighbors. Targets configured as having an equivalent
 * control elsewhere become `needs-review`, since the engine cannot verify the equivalence.
 */
export function detectTargetSize(targets: readonly TargetSizeInput[]): TargetSizeFailure[] {
  const out: TargetSizeFailure[] = [];
  for (const t of targets) {
    if (t.exempt || !isUndersized(t.box)) continue;
    const others = targets
      .filter((o) => o.id !== t.id && !t.ancestors.includes(o.id) && !o.ancestors.includes(t.id))
      .map((o) => ({ box: o.box, undersized: !o.exempt && isUndersized(o.box) }));
    if (!failsSpacing(t.box, others)) continue;
    out.push({ id: t.id, tier: t.equivalent ? 'needs-review' : 'violation' });
  }
  return out;
}

export const TARGET_SIZE_EQUIVALENT_QUESTION =
  'Is there another control on this page, at least 24 by 24 CSS px, that does the same thing as this small target?';
