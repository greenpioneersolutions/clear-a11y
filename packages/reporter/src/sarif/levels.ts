import type { Tier } from '@clear-a11y/core';
import type { SarifLevel } from './types.js';

const LEVELS: Record<Tier, SarifLevel> = {
  violation: 'error',
  likely: 'warning',
  'needs-review': 'note',
};

/** violation -> error, likely -> warning, needs-review -> note. */
export function sarifLevel(tier: Tier): SarifLevel {
  return LEVELS[tier];
}
