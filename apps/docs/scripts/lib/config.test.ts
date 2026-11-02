import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { configRows, configTable, flattenSchema, type JsonSchema } from './config.ts';

const Sample = z.object({
  targets: z.array(z.string()).default([]),
  crawl: z
    .object({ enabled: z.boolean().default(false), maxPages: z.number().int().default(20) })
    .prefault({}),
  viewports: z
    .array(z.object({ name: z.string(), width: z.number().int() }))
    .default([{ name: 'desktop', width: 1280 }]),
  failOn: z.enum(['violation', 'likely']).default('violation'),
  keyboard: z.record(z.string(), z.unknown()).default({}),
  token: z.string().optional(),
});
const schema = z.toJSONSchema(Sample, { io: 'input', unrepresentable: 'any' }) as JsonSchema;

describe('flattenSchema', () => {
  it('lists nested options with types and defaults', () => {
    expect(flattenSchema(schema)).toEqual([
      { path: 'targets', type: 'string[]', default: '[]' },
      { path: 'crawl', type: 'object' },
      { path: 'crawl.enabled', type: 'boolean', default: 'false' },
      { path: 'crawl.maxPages', type: 'integer', default: '20' },
      { path: 'viewports', type: 'object[]', default: '[{"name":"desktop","width":1280}]' },
      { path: 'viewports[].name', type: 'string' },
      { path: 'viewports[].width', type: 'integer' },
      { path: 'failOn', type: '"violation" | "likely"', default: '"violation"' },
      { path: 'keyboard', type: 'object' },
      { path: 'token', type: 'string' },
    ]);
  });
});

describe('configRows', () => {
  const all = Object.fromEntries(flattenSchema(schema).map((r) => [r.path, `About ${r.path}.`]));

  it('joins descriptions and renders an escaped table', () => {
    const { rows, errors } = configRows([{ schema }], all);
    expect(errors).toEqual([]);
    expect(configTable(rows)).toContain(
      '| `failOn` | `"violation" \\| "likely"` | `"violation"` | About failOn. |',
    );
    expect(configTable(rows)).toContain('| `token` | `string` | – | About token. |');
  });

  it('nests a section under a prefix', () => {
    const repo = z.toJSONSchema(z.object({ maxFiles: z.number().default(5) }), {
      io: 'input',
    }) as JsonSchema;
    const { rows, errors } = configRows([{ schema: repo, prefix: 'repo' }], {
      'repo.maxFiles': 'Limit.',
    });
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { path: 'repo.maxFiles', type: 'number', default: '5', description: 'Limit.' },
    ]);
  });

  it('fails on drift in both directions', () => {
    const { token: _token, ...missing } = all;
    const { errors } = configRows([{ schema }], { ...missing, removed: 'Gone.' });
    expect(errors).toEqual([
      'Config option "token" has no description (add .describe() to its schema, or an entry in scripts/config-descriptions.ts).',
      'scripts/config-descriptions.ts describes "removed", which is not in the config schema.',
    ]);
  });

  it('prefers .describe() text from the schema and rejects a duplicate fallback', () => {
    const described = z.toJSONSchema(
      z.object({
        dir: z.string().default('out').describe('Report folder.'),
        level: z.number().optional(),
      }),
      { io: 'input' },
    ) as JsonSchema;
    const ok = configRows([{ schema: described }], { level: 'Fallback.' });
    expect(ok.errors).toEqual([]);
    expect(ok.rows.map((r) => r.description)).toEqual(['Report folder.', 'Fallback.']);
    const dup = configRows([{ schema: described }], { dir: 'Again.', level: 'Fallback.' });
    expect(dup.errors).toEqual([
      'Config option "dir" is described in its schema; remove it from scripts/config-descriptions.ts.',
    ]);
  });
});
