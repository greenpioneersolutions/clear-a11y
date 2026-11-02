import { z } from 'zod';

/**
 * Prompt-injection hardening, part 2: the only thing taken from a model is this schema-validated
 * verdict. Extra fields (a "tier", a "violation" flag...) are dropped; anything else is invalid.
 */
export const VerdictSchema = z.object({
  verdict: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z
      .enum(['pass', 'fail', 'uncertain', 'unsure'])
      .transform((v) => (v === 'unsure' ? 'uncertain' : v)),
  ),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(2_000),
  suggestion: z.string().trim().max(2_000).optional(),
});
export type Verdict = {
  verdict: 'pass' | 'fail' | 'uncertain';
  confidence: number;
  reason: string;
  suggestion?: string;
};

/** JSON schema sent as the structured-output format (kept to the subset all providers accept). */
export const VERDICT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'uncertain'] },
    confidence: { type: 'number' },
    reason: { type: 'string' },
    suggestion: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'reason'],
  additionalProperties: false,
} as const;

function candidatesFrom(text: string): string[] {
  const trimmed = text.trim();
  const out = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) out.push(fenced[1]!.trim());
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) out.push(trimmed.slice(first, last + 1));
  return out;
}

export type ParsedVerdict = { ok: true; verdict: Verdict } | { ok: false; error: string };

/** Parses model text into a verdict: plain JSON, fenced JSON, or JSON surrounded by prose. */
export function parseVerdict(text: string): ParsedVerdict {
  let lastError = 'no JSON object found';
  for (const candidate of candidatesFrom(text)) {
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch {
      continue;
    }
    const parsed = VerdictSchema.safeParse(json);
    if (parsed.success) return { ok: true, verdict: parsed.data as Verdict };
    lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  return { ok: false, error: lastError };
}
