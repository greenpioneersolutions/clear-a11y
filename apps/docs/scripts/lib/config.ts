import { cell, prose } from './markdown.ts';

/** The parts of a JSON Schema (from `z.toJSONSchema`) the config table uses. */
export interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: unknown;
  anyOf?: JsonSchema[];
  minItems?: number;
  /** From `.describe()` on the Zod schema. */
  description?: string;
}

export interface ConfigRow {
  path: string;
  type: string;
  default?: string;
  description: string;
}

function typeOf(s: JsonSchema): string {
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (s.anyOf) return s.anyOf.map(typeOf).join(' | ');
  if (s.type === 'array') return `${s.items ? typeOf(s.items) : 'unknown'}[]`;
  if (Array.isArray(s.type)) return s.type.join(' | ');
  return s.type ?? 'unknown';
}

const showDefault = (v: unknown) => {
  if (v === undefined) return undefined;
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0)
    return undefined;
  return JSON.stringify(v);
};

/**
 * Flattens a JSON Schema into one row per option ("crawl.maxPages", "viewports[].width").
 * Objects with properties are expanded; open objects without properties are one row.
 */
export function flattenSchema(
  schema: JsonSchema,
  prefix = '',
): Array<Omit<ConfigRow, 'description'> & { description?: string }> {
  const rows: Array<Omit<ConfigRow, 'description'> & { description?: string }> = [];
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    const def = showDefault(child.default);
    rows.push({
      path,
      type: typeOf(child),
      ...(def !== undefined ? { default: def } : {}),
      ...(child.description ? { description: child.description } : {}),
    });
    if (child.properties) rows.push(...flattenSchema(child, path));
    if (child.type === 'array' && child.items?.properties)
      rows.push(...flattenSchema(child.items, `${path}[]`));
  }
  return rows;
}

/** One schema to document, optionally nested under a prefix ("repo"). */
export interface ConfigSection {
  schema: JsonSchema;
  prefix?: string;
}

/**
 * Joins schema rows with their descriptions: the schema's own `.describe()` text first, then the
 * hand-written fallback (`scripts/config-descriptions.ts`, for schemas without descriptions).
 * Fails on drift: an option with no description anywhere, a fallback for an option that no
 * longer exists, or a fallback for an option the schema already describes.
 */
export function configRows(
  sections: readonly ConfigSection[],
  descriptions: Readonly<Record<string, string>>,
): { rows: ConfigRow[]; errors: string[] } {
  const flat = sections.flatMap(({ schema, prefix }) => flattenSchema(schema, prefix ?? ''));
  const errors: string[] = [];
  const known = new Set(flat.map((r) => r.path));
  const rows = flat.map((r) => {
    const fallback = descriptions[r.path];
    if (r.description && fallback)
      errors.push(
        `Config option "${r.path}" is described in its schema; remove it from scripts/config-descriptions.ts.`,
      );
    const description = r.description ?? fallback;
    if (!description)
      errors.push(
        `Config option "${r.path}" has no description (add .describe() to its schema, or an entry in scripts/config-descriptions.ts).`,
      );
    return { ...r, description: description ?? '' };
  });
  for (const path of Object.keys(descriptions))
    if (!known.has(path))
      errors.push(
        `scripts/config-descriptions.ts describes "${path}", which is not in the config schema.`,
      );
  return { rows, errors };
}

export function configTable(rows: readonly ConfigRow[]): string {
  return [
    '| Option | Type | Default | What it does |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| \`${r.path}\` | \`${cell(r.type)}\` | ${r.default !== undefined ? `\`${cell(r.default)}\`` : '–'} | ${prose(r.description)} |`,
    ),
  ].join('\n');
}
