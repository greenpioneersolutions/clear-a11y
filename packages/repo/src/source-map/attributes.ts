/**
 * The source-location attribute convention. A dev build (or a tiny Babel/SWC/Vite plugin) can tag
 * rendered elements with where they were written; Clear A11Y then reports runtime findings at that
 * file and line. Recognized, in order of preference:
 *
 *   data-clear-a11y-src="src/components/Card.tsx:12[:5]"        (Clear A11Y convention)
 *   data-source-file="src/components/Card.tsx" data-source-line="12" [data-source-column="5"]
 *   data-inspector-relative-path="src/components/Card.tsx" data-inspector-line="12"
 *     [data-inspector-column="5"]                                (react-dev-inspector)
 *
 * The nearest ancestor-or-self carrying one of them wins (see `sourceAttributesProbe`).
 */

export const SOURCE_ATTRIBUTE = 'data-clear-a11y-src';

export const SOURCE_ATTRIBUTE_PAIRS: ReadonlyArray<
  readonly [file: string, line: string, column: string]
> = [
  ['data-source-file', 'data-source-line', 'data-source-column'],
  ['data-inspector-relative-path', 'data-inspector-line', 'data-inspector-column'],
];

/** Every attribute name the convention uses (what a page probe collects). */
export const SOURCE_ATTRIBUTE_NAMES: readonly string[] = [
  SOURCE_ATTRIBUTE,
  ...SOURCE_ATTRIBUTE_PAIRS.flat(),
];

export interface SourceRef {
  file: string;
  line: number;
  column?: number;
}

const positiveInt = (s: string | undefined): number | undefined => {
  if (!s || !/^\d+$/.test(s.trim())) return undefined;
  const n = Number(s);
  return n > 0 ? n : undefined;
};

/** "src/App.tsx:12" or "src/App.tsx:12:5" (also Windows paths like "C:\\app\\src\\App.tsx:12:5"). */
export function parseSourceRef(value: string): SourceRef | undefined {
  const m = /^(.+?):(\d+)(?::(\d+))?$/.exec(value.trim());
  if (!m) return undefined;
  const line = positiveInt(m[2]);
  if (!m[1] || !line) return undefined;
  const column = positiveInt(m[3]);
  return { file: m[1], line, ...(column ? { column } : {}) };
}

/** Source reference from a set of element attributes, or undefined when none is usable. */
export function sourceRefFromAttributes(
  attrs: Readonly<Record<string, string | undefined>>,
): SourceRef | undefined {
  const combined = attrs[SOURCE_ATTRIBUTE];
  if (combined) {
    const ref = parseSourceRef(combined);
    if (ref) return ref;
  }
  for (const [fileAttr, lineAttr, colAttr] of SOURCE_ATTRIBUTE_PAIRS) {
    const file = attrs[fileAttr]?.trim();
    const line = positiveInt(attrs[lineAttr]);
    if (!file || !line) continue;
    const column = positiveInt(attrs[colAttr]);
    return { file, line, ...(column ? { column } : {}) };
  }
  return undefined;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Attributes of the first tag in an HTML snippet (a finding's `evidence.html`). */
export function attributesFromHtml(html: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const tag = html
    ? /<[a-zA-Z][\w:-]*((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/.exec(html)
    : null;
  if (!tag?.[1]) return out;
  const attr = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (let m = attr.exec(tag[1]); m; m = attr.exec(tag[1])) {
    const raw = m[2] ?? m[3] ?? m[4] ?? '';
    out[(m[1] as string).toLowerCase()] = raw.replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, e: string) => ENTITIES[e] ?? _,
    );
  }
  return out;
}

/**
 * Runs IN THE PAGE (pass it to Playwright's `locator.evaluate`): collects the source attributes of
 * the nearest ancestor-or-self that has any. Self-contained on purpose (Playwright serializes it),
 * so it repeats the attribute names instead of importing them.
 */
export function sourceAttributesProbe(el: Element): Record<string, string> | null {
  const names = [
    'data-clear-a11y-src',
    'data-source-file',
    'data-source-line',
    'data-source-column',
    'data-inspector-relative-path',
    'data-inspector-line',
    'data-inspector-column',
  ];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const found: Record<string, string> = {};
    for (const name of names) {
      const v = n.getAttribute(name);
      if (v !== null) found[name] = v;
    }
    if (Object.keys(found).length) return found;
  }
  return null;
}
