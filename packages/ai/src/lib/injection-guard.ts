/**
 * Prompt-injection hardening, part 3: a deterministic guard. Candidate text that reads like
 * instructions to an AI is flagged `needs-review` and can never produce a `pass`, whatever the
 * model answers. Patterns are deliberately specific so ordinary page copy doesn't trip them.
 */
export const INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(previous|prior|above|earlier|preceding|all|any|the|your)\b[^.!?\n]{0,30}\b(instructions?|prompts?|rules|directions|guidelines|context)\b/i,
  /\bnew (instructions?|rules|task)\s*:/i,
  /\byou are (now|no longer)\b/i,
  /\b(act|behave|pretend|respond) as (if|though|an?)\b/i,
  /\b(as an|dear|attention|note to( the)?) (ai|llm|language model|assistant|chatbot|auditor bot)\b/i,
  /\b(ai|llm|language model)s?\b[^.!?\n]{0,30}\b(must|should|shall)\b[^.!?\n]{0,30}\b(answer|respond|report|say|output|return|mark|rate|classify)\b/i,
  /\b(answer|respond|reply|output|return)\b[^.!?\n]{0,20}["'“]?\s*(pass|passed|compliant|no issues?)\b/i,
  /\b(report|mark|rate|classify|label)\b[^.!?\n]{0,30}\bas\b[^.!?\n]{0,20}\b(pass(ing|ed)?|compliant|perfectly (described|clear|fine|accessible)|no issues?)\b/i,
  /"?verdict"?\s*[:=]\s*"?(pass|fail|uncertain)/i,
  /^\s*(system|assistant|developer|user)\s*:/im,
  /<\/?\s*(system|instructions?|page_data|prompt|assistant)\b/i,
  /\[\/?(inst|system)\]/i,
  /<\|[a-z_]+\|>/i,
];

const MAX_SNIPPET = 120;

/** Every string value in a (nested) candidate input. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => collectStrings(v, out));
  }
  return out;
}

/** Returns the first instruction-like snippet found in the input, or undefined. */
export function findInstructionLikeText(input: unknown): string | undefined {
  for (const text of collectStrings(input)) {
    for (const pattern of INSTRUCTION_PATTERNS) {
      const m = pattern.exec(text);
      if (m) {
        const snippet = m[0].replace(/\s+/g, ' ').trim();
        return snippet.length > MAX_SNIPPET ? `${snippet.slice(0, MAX_SNIPPET - 1)}…` : snippet;
      }
    }
  }
  return undefined;
}
