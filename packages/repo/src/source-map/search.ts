import type { Finding } from '@clear-a11y/core';
import { attributesFromHtml } from './attributes.js';

/** What a runtime finding tells us that might appear literally in source. */
export interface SearchClues {
  id?: string;
  testId?: string;
  classes: string[];
  text?: string;
}

export type SearchStrategy = 'id' | 'testid' | 'class' | 'text';

export interface SourceCandidate {
  file: string;
  line: number;
  strategy: SearchStrategy | 'combined';
  confidence: number;
}

/** Confidence for a clue found in exactly one place in the repo. */
export const UNIQUE_CONFIDENCE: Record<SearchStrategy, number> = {
  id: 0.9,
  testid: 0.9,
  class: 0.6,
  text: 0.5,
};

const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
/** Class names from CSS-in-JS and scoping tools: generated, never in source. */
const GENERATED_CLASS = /^(css|sc|jsx|svelte|emotion|tw)-|^_|^\d/;

const unescapeCss = (s: string) =>
  s.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_, c: string) =>
    /^[0-9a-fA-F]/.test(c) && c.trim().length > 1
      ? String.fromCodePoint(parseInt(c.trim(), 16))
      : c,
  );

/** Last compound of a CSS selector ("main > .card #buy" -> "#buy"). */
const lastCompound = (selector: string) =>
  selector
    .trim()
    .split(/\s*[\s>+~]\s*(?![^[]*\])/)
    .pop() ?? '';

/** Extracts search clues from a runtime finding's selector, HTML snippet and accessible name. */
export function cluesFromFinding(finding: Pick<Finding, 'target' | 'evidence'>): SearchClues {
  const attrs = attributesFromHtml(finding.evidence.html);
  const compound = lastCompound(finding.target.selector);
  const idFromSelector = /#((?:\\.|[\w-])+)/.exec(compound)?.[1];
  const id = attrs['id'] ?? (idFromSelector ? unescapeCss(idFromSelector) : undefined);
  let testId = TEST_ID_ATTRIBUTES.map((a) => attrs[a]).find(Boolean);
  if (!testId) {
    const m = /\[(data-testid|data-test-id|data-test|data-cy|data-qa)=["']?([^"'\]]+)["']?\]/.exec(
      finding.target.selector,
    );
    testId = m?.[2];
  }
  const classes = new Set<string>();
  for (const c of (attrs['class'] ?? '').split(/\s+/)) if (c) classes.add(c);
  for (const m of compound.matchAll(/\.((?:\\.|[\w-])+)/g))
    classes.add(unescapeCss(m[1] as string));
  const htmlText = (finding.evidence.html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const text = [finding.target.name, htmlText]
    .map((t) => t?.replace(/\s+/g, ' ').trim())
    .find((t) => !!t && t.length >= 4 && t.length <= 80 && !t.includes('…'));
  return {
    ...(id ? { id } : {}),
    ...(testId ? { testId } : {}),
    classes: [...classes].filter((c) => c.length >= 3 && !GENERATED_CLASS.test(c)),
    ...(text ? { text } : {}),
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

function matches(
  files: ReadonlyMap<string, string>,
  re: RegExp,
  accept: (m: RegExpExecArray) => boolean = () => true,
) {
  const out: Array<{ file: string; line: number }> = [];
  for (const [file, text] of files) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (accept(m)) out.push({ file, line: lineAt(text, m.index) });
      if (out.length > 20) return out; // far from unique: stop early
    }
  }
  return out;
}

const QUOTE_OPEN = `(?:\\{\\s*)?(["'\`])`;

/** Literal occurrences of each clue across the source files. */
export function searchClues(
  files: ReadonlyMap<string, string>,
  clues: SearchClues,
): Record<SearchStrategy, Array<{ file: string; line: number }>> {
  const attrValue = (attr: string, value: string) =>
    new RegExp(`(?:^|[\\s{(,])${attr}\\s*=\\s*${QUOTE_OPEN}${esc(value)}\\1`, 'g');
  const byClass = clues.classes.map((c) =>
    matches(files, /(?:^|[\s{(,])(?:className|class)\s*=\s*(?:\{\s*)?(["'`])([^"'`]*)\1/g, (m) =>
      (m[2] ?? '').split(/\s+/).includes(c),
    ),
  );
  return {
    id: clues.id ? matches(files, attrValue('id', clues.id)) : [],
    testid: clues.testId
      ? matches(
          files,
          new RegExp(
            `(?:^|[\\s{(,])(?:${TEST_ID_ATTRIBUTES.join('|')})\\s*=\\s*${QUOTE_OPEN}${esc(clues.testId)}\\1`,
            'g',
          ),
        )
      : [],
    // The most specific class: the one with the fewest occurrences.
    class: byClass.filter((m) => m.length).sort((a, b) => a.length - b.length)[0] ?? [],
    text: clues.text ? matches(files, new RegExp(esc(clues.text).replace(/ /g, '\\s+'), 'g')) : [],
  };
}

/**
 * Scores search hits. A clue found in one place gets UNIQUE_CONFIDENCE; two places split it.
 * Different clues that point at the same spot (same file, within 3 lines) reinforce each other.
 * Returns candidates best first.
 */
export function scoreCandidates(
  hits: Record<SearchStrategy, Array<{ file: string; line: number }>>,
): SourceCandidate[] {
  const singles: SourceCandidate[] = [];
  for (const strategy of Object.keys(hits) as SearchStrategy[]) {
    const list = hits[strategy];
    if (!list.length || list.length > 2) continue;
    for (const h of list)
      singles.push({ ...h, strategy, confidence: UNIQUE_CONFIDENCE[strategy] / list.length });
  }
  const combined: SourceCandidate[] = [];
  for (const c of singles) {
    const agree = singles.filter(
      (o) => o.file === c.file && Math.abs(o.line - c.line) <= 3 && o.strategy !== c.strategy,
    );
    if (!agree.length) continue;
    const miss = [c, ...agree].reduce((p, o) => p * (1 - o.confidence), 1);
    combined.push({
      file: c.file,
      line: c.line,
      strategy: 'combined',
      confidence: Math.min(0.97, Math.round((1 - miss) * 100) / 100),
    });
  }
  const all = [...combined, ...singles].sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<string>();
  return all.filter((c) => {
    const k = `${c.file}:${c.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
