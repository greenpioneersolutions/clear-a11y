import type { RuleMeta } from '@clear-a11y/core';
import type { JudgeId } from '../config.js';
import { altTextJudge } from './alt-text.js';
import { colorOnlyJudge } from './color-only.js';
import { descriptiveJudge } from './descriptive.js';
import { errorClarityJudge } from './error-clarity.js';
import { focusOrderJudge } from './focus-order.js';
import { labelInNameJudge } from './label-in-name.js';
import { linkPurposeJudge } from './link-purpose.js';
import type { Judge } from './types.js';

export const JUDGES: readonly Judge[] = [
  altTextJudge,
  labelInNameJudge,
  linkPurposeJudge,
  descriptiveJudge,
  errorClarityJudge,
  colorOnlyJudge,
  focusOrderJudge,
];

export const judgeById = (id: JudgeId): Judge => {
  const judge = JUDGES.find((j) => j.id === id);
  if (!judge) throw new Error(`unknown judge: ${id}`);
  return judge;
};

export const engineNameOf = (judge: Pick<Judge, 'id'>) => `ai-${judge.id}`;
export const ruleIdOf = (judge: Pick<Judge, 'id'>) => `ai/${judge.id}`;

/** Rule metadata for docs and reports. Default tier `likely`: AI findings are never violations. */
export const rules: RuleMeta[] = JUDGES.map((j) => ({
  id: ruleIdOf(j),
  engine: engineNameOf(j),
  wcag: j.wcag,
  tier: 'likely',
  title: j.title,
  description: `AI judge for WCAG ${j.wcag.join(', ')}. Deterministic code picks the candidates; a model you configure answers one yes/no question per candidate. Findings are likely or needs-review, never violation.`,
  fix: j.fix,
}));
