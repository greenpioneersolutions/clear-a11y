import type { SuccessCriterion, Tier } from '@clear-a11y/core';

export type ScLookup = (sc: string) => SuccessCriterion | undefined;

/** "[2.4.3 Focus Order](https://www.w3.org/...)" with the level, or the bare number when unknown. */
export function scLink(sc: string, lookup: ScLookup, withLevel = true): string {
  const c = lookup(sc);
  if (!c) return sc;
  return `[${c.sc} ${c.title}](${c.understanding})${withLevel ? ` (Level ${c.level})` : ''}`;
}

export const TIER_TEXT: Record<Tier, string> = {
  violation: 'Deterministic and high certainty. Allowed to fail CI.',
  likely: 'A strong signal with a small chance of a false positive. A person should confirm it.',
  'needs-review': 'A person decides, by answering a short yes/no question.',
};

/** Human names for engine layers (the part after "engine-", or ai/persona/repo). */
export const LAYER_NAMES: Record<string, string> = {
  static: 'Static rules (axe-core)',
  keyboard: 'Keyboard',
  states: 'Hidden states',
  visual: 'Visual',
  at: 'Accessibility tree and announcements',
  widgets: 'ARIA widget patterns',
  ai: 'AI judges',
  persona: 'Persona agents',
  repo: 'Repo (source lint)',
};

export const LAYER_ORDER = Object.keys(LAYER_NAMES);

export const layerName = (layer: string) => LAYER_NAMES[layer] ?? layer;

export const layerRank = (layer: string) => {
  const i = LAYER_ORDER.indexOf(layer);
  return i < 0 ? LAYER_ORDER.length : i;
};
