import { captureElement, type PageContext } from '@clear-a11y/browser';
import {
  compareTiers,
  createFinding,
  type Evidence,
  type Finding,
  type RuleMeta,
  type Tier,
} from '@clear-a11y/core';
import type { VisualConfig } from './config.js';

export const ENGINE_NAME = 'engine-visual';

/** Screenshot crops per page are capped to keep scans fast. */
const MAX_SCREENSHOTS = 10;

const CONFIDENCE: Record<Tier, number> = { violation: 0.95, likely: 0.75, 'needs-review': 0.5 };

export interface EmitInput {
  selector: string;
  message: string;
  tier?: Tier;
  wcag?: string[];
  evidence?: Evidence;
  question?: string;
  confidence?: number;
  /** Take a screenshot crop of the selector now (while the page shows the problem). */
  screenshot?: boolean;
}

/** Shared state for one engine run: findings, config, time budget. */
export class VisualRun {
  readonly findings: Finding[] = [];
  private shots = 0;

  constructor(
    readonly ctx: PageContext,
    readonly config: VisualConfig,
    /** Epoch ms after which slow checks are skipped so the run finishes inside the runner timeout. */
    readonly deadline: number,
  ) {}

  timeLeft(): number {
    return this.deadline - Date.now();
  }

  async emit(rule: RuleMeta, input: EmitInput): Promise<void> {
    const tier = input.tier ?? rule.tier;
    const evidence: Evidence = { ...input.evidence };
    if (input.screenshot && this.shots < MAX_SCREENSHOTS) {
      const shot = await captureElement(this.ctx, input.selector, rule.id.replace('/', '-'));
      if (shot) {
        evidence.screenshot = shot;
        this.shots++;
      }
    }
    const finding = createFinding({
      ruleId: rule.id,
      wcag: input.wcag ?? rule.wcag,
      tier,
      confidence: input.confidence ?? CONFIDENCE[tier],
      engine: ENGINE_NAME,
      page: { url: this.ctx.url, state: this.ctx.state, viewport: this.ctx.viewport.name },
      target: { selector: input.selector },
      evidence,
      message: input.message,
      fix: rule.fix,
      ...(input.question ? { question: input.question } : {}),
    });
    // One finding per rule + target: keep the most severe.
    const i = this.findings.findIndex((f) => f.id === finding.id);
    const prev = this.findings[i];
    if (!prev) this.findings.push(finding);
    else if (compareTiers(finding.tier, prev.tier) < 0) this.findings[i] = finding;
  }
}

export const round = (n: number, digits = 2): number => Number(n.toFixed(digits));
