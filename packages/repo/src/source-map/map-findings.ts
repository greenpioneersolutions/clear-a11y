import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Finding, SourceLocation } from '@clear-a11y/core';
import { detectRepo } from '../detect/detect-repo.js';
import { listSourceFiles } from '../detect/files.js';
import { attributesFromHtml, sourceRefFromAttributes, type SourceRef } from './attributes.js';
import { fileFromReactSource, type ReactDebugSource } from './react-fiber.js';
import { cluesFromFinding, scoreCandidates, searchClues, type SourceCandidate } from './search.js';

/**
 * Extra facts about a runtime finding's element, gathered from the live page by the caller (S10
 * runs `sourceAttributesProbe` / `reactDebugSourceProbe` through Playwright). This package never
 * touches a browser itself.
 */
export interface SourceHints {
  /** Source attributes of the nearest ancestor-or-self (see attributes.ts for the convention). */
  attributes?: Record<string, string> | null;
  react?: ReactDebugSource | null;
}

export interface MapFindingsOptions {
  /** Per-finding hints from the live page. */
  hints?: (
    finding: Finding,
  ) => SourceHints | null | undefined | Promise<SourceHints | null | undefined>;
  /** Only set `finding.source` at or above this confidence. Default 0.8. */
  minConfidence?: number;
  /** Repo-relative source files to search (default: detected source folders). */
  files?: readonly string[];
}

export type MappingStrategy = 'attribute' | 'react-debug-source' | SourceCandidate['strategy'];

const SEARCH_EXTENSIONS = ['js', 'jsx', 'mjs', 'ts', 'tsx', 'vue', 'svelte', 'html'];
const toPosix = (p: string) => p.replace(/\\/g, '/');

/**
 * Repo-relative POSIX path for a file reference, or undefined when it points outside the repo.
 * Accepts absolute paths (POSIX or Windows), "./src/App.tsx" and dev-server style "/src/App.tsx".
 */
export function normalizeRepoPath(file: string, repoRoot: string): string | undefined {
  const f = toPosix(file.trim());
  const root = toPosix(repoRoot).replace(/\/+$/, '');
  const sameRoot = (a: string, b: string) =>
    /^[a-zA-Z]:/.test(b)
      ? a.toLowerCase().startsWith(`${b.toLowerCase()}/`)
      : a.startsWith(`${b}/`);
  let rel: string;
  if (sameRoot(f, root)) rel = f.slice(root.length + 1);
  else if (/^[a-zA-Z]:\//.test(f)) return undefined;
  else rel = f.replace(/^\.?\/+/, '');
  rel = rel.replace(/^\.\//, '');
  if (!rel || rel.split('/').includes('..')) return undefined;
  return rel;
}

interface Resolved {
  location: SourceLocation;
  strategy: MappingStrategy;
  confidence: number;
}

/** Repo source files and their contents, loaded on first use. */
class SourceIndex {
  private texts?: Map<string, string>;
  private known?: Set<string>;
  constructor(
    private readonly root: string,
    private readonly files?: readonly string[],
  ) {}

  private async list(): Promise<string[]> {
    if (this.files) return [...this.files].map(toPosix);
    const detection = await detectRepo(this.root);
    const dirs = detection.sourceDirs.length ? detection.sourceDirs : ['.'];
    return (await listSourceFiles(this.root, dirs, { extensions: SEARCH_EXTENSIONS })).files;
  }

  async has(file: string): Promise<boolean> {
    this.known ??= new Set(await this.list());
    if (this.known.has(file)) return true;
    // Attribute paths can point at files outside the searched folders (or test files).
    return stat(join(this.root, file)).then(
      (s) => s.isFile(),
      () => false,
    );
  }

  async contents(): Promise<Map<string, string>> {
    if (this.texts) return this.texts;
    const files = await this.list();
    this.texts = new Map();
    for (const f of files) {
      const text = await readFile(join(this.root, f), 'utf-8').catch(() => undefined);
      if (text !== undefined) this.texts.set(f, text);
    }
    return this.texts;
  }
}

async function fromRef(
  ref: SourceRef,
  root: string,
  index: SourceIndex,
): Promise<SourceLocation | undefined> {
  const file = normalizeRepoPath(ref.file, root);
  if (!file || !(await index.has(file))) return undefined;
  return { file, line: ref.line, ...(ref.column !== undefined ? { column: ref.column } : {}) };
}

async function resolve(
  finding: Finding,
  hints: SourceHints | null | undefined,
  root: string,
  index: SourceIndex,
): Promise<{ best?: Resolved; candidates: SourceCandidate[] }> {
  // 1. Attribute convention: from the page probe, else from the element's own HTML snippet.
  const attrs = hints?.attributes ?? attributesFromHtml(finding.evidence.html);
  const ref = sourceRefFromAttributes(attrs);
  if (ref) {
    const location = await fromRef(ref, root, index);
    if (location)
      return { best: { location, strategy: 'attribute', confidence: 1 }, candidates: [] };
  }
  // 2. React dev-build debug info.
  if (hints?.react) {
    const r = hints.react;
    const location = await fromRef(
      { file: fileFromReactSource(r.fileName), line: r.lineNumber, column: r.columnNumber },
      root,
      index,
    );
    if (location) {
      const best = {
        location,
        strategy: 'react-debug-source' as const,
        confidence: r.fromStack ? 0.6 : 0.95,
      };
      return { best, candidates: [] };
    }
  }
  // 3. Literal search for id / test id / class / text.
  const clues = cluesFromFinding(finding);
  if (!clues.id && !clues.testId && !clues.classes.length && !clues.text) return { candidates: [] };
  const candidates = scoreCandidates(searchClues(await index.contents(), clues));
  const top = candidates[0];
  return {
    ...(top
      ? {
          best: {
            location: { file: top.file, line: top.line },
            strategy: top.strategy,
            confidence: top.confidence,
          },
        }
      : {}),
    candidates,
  };
}

/**
 * Best-effort runtime -> source mapping. For each finding without `source`, tries the attribute
 * convention, React debug info (via `hints`), then a literal search for the element's id, test id,
 * class and text. `source` is only set when the confidence reaches `minConfidence` (default 0.8);
 * otherwise the top candidates are kept in `evidence.data.sourceCandidates` for a human. Never
 * guesses a location. Returns new finding objects; inputs are not modified.
 */
export async function mapFindingsToSource(
  findings: readonly Finding[],
  repoPath: string,
  options: MapFindingsOptions = {},
): Promise<Finding[]> {
  const min = options.minConfidence ?? 0.8;
  const index = new SourceIndex(repoPath, options.files);
  const out: Finding[] = [];
  for (const f of findings) {
    if (f.source) {
      out.push(f);
      continue;
    }
    const { best, candidates } = await resolve(f, await options.hints?.(f), repoPath, index);
    if (best && best.confidence >= min) {
      out.push({
        ...f,
        source: best.location,
        evidence: {
          ...f.evidence,
          data: {
            ...f.evidence.data,
            sourceMatch: { strategy: best.strategy, confidence: best.confidence },
          },
        },
      });
    } else if (candidates.length || best) {
      const list = candidates.length
        ? candidates
        : best
          ? [{ ...best.location, strategy: best.strategy, confidence: best.confidence }]
          : [];
      out.push({
        ...f,
        evidence: {
          ...f.evidence,
          data: { ...f.evidence.data, sourceCandidates: list.slice(0, 3) },
        },
      });
    } else out.push(f);
  }
  return out;
}
