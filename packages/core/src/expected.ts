import { z } from 'zod';

/**
 * Benchmark ground truth: what a human auditor would log for a fixture page.
 * Stored in fixtures/expected/<page path>.json.
 */
export const ExpectedIssueSchema = z.object({
  id: z.string(),
  /** First SC is the primary one used for recall-by-SC; others are accepted alternatives. */
  wcag: z.array(z.string()).min(1),
  selector: z.string(),
  /** Layer we expect to catch it (static, keyboard, states, visual, at, widgets, ai, persona, repo). */
  layer: z.string(),
  description: z.string(),
  ruleId: z.string().optional(),
  /** State in which the barrier shows (e.g. "form:invalid"); omitted = any state. */
  state: z.string().optional(),
});
export type ExpectedIssue = z.infer<typeof ExpectedIssueSchema>;

export const ExpectedPageSchema = z.object({
  $schema: z.string().optional(),
  page: z.string(),
  title: z.string(),
  correctPattern: z.boolean(),
  issues: z.array(ExpectedIssueSchema),
});
export type ExpectedPage = z.infer<typeof ExpectedPageSchema>;
