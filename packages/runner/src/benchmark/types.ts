import type { Tier } from '@clear-a11y/core';

export interface Ratio {
  expected: number;
  matched: number;
  recall: number;
}

export interface BenchmarkResult {
  generatedAt: string;
  label?: string;
  pages: number;
  correctPatternPages: number;
  expectedIssues: number;
  matchedIssues: number;
  /** Matched expected issues / expected issues, any tier. */
  recall: number;
  violation: {
    total: number;
    truePositive: number;
    falsePositive: number;
    /** null when there are no violation findings at all. */
    precision: number | null;
  };
  findings: { total: number; byTier: Record<Tier, number> };
  /** Recall keyed by the issue's primary SC. */
  bySc: Record<string, Ratio>;
  /** Recall keyed by the layer we expect to catch the issue. */
  byLayer: Record<string, Ratio>;
  /** For matched issues: which layers actually found them (an issue can count for several). */
  foundBy: Record<string, number>;
  missed: Array<{ page: string; id: string; wcag: string[]; layer: string; description: string }>;
  falsePositives: Array<{
    page: string;
    ruleId: string;
    selector: string;
    tier: Tier;
    message: string;
  }>;
  /** Findings of any tier on correct-pattern pages (noise that erodes trust). */
  correctPatternNoise: Array<{ page: string; ruleId: string; selector: string; tier: Tier }>;
}
