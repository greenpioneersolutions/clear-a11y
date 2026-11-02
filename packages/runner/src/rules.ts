import { personaRule } from '@clear-a11y/ai';
import type { RuleMeta } from '@clear-a11y/core';
import { rules as atRules } from '@clear-a11y/engine-at';
import { rules as keyboardRules } from '@clear-a11y/engine-keyboard';
import { rules as staticRules } from '@clear-a11y/engine-static';
import { rules as statesRules } from '@clear-a11y/engine-states';
import { rules as visualRules } from '@clear-a11y/engine-visual';
import { rules as widgetsRules } from '@clear-a11y/engine-widgets';

/**
 * Rule metadata from every registered engine, sorted by id. Reporters take this as input (they
 * never import engines), e.g. `toHtml(result, { rules: allRules() })`.
 */
export function allRules(): RuleMeta[] {
  return [
    ...staticRules,
    ...keyboardRules,
    ...statesRules,
    ...visualRules,
    ...atRules,
    ...widgetsRules,
    personaRule,
  ].sort((a, b) => a.id.localeCompare(b.id));
}
