import { z } from 'zod';
import { sampleFindings, sampleResult } from '../../test/sample.js';
import { sarifLevel } from './levels.js';
import {
  FINGERPRINT_KEY,
  sarifLocation,
  sarifToString,
  SARIF_SCHEMA_URL,
  sourceUri,
  toSarif,
} from './to-sarif.js';

/**
 * Hand-written shape of the parts of the SARIF 2.1.0 schema that are required, or that GitHub
 * code scanning relies on. Offline: the official schema is not fetched.
 */
const message = z.object({ text: z.string().min(1) }).passthrough();
const artifactLocation = z.object({ uri: z.string().min(1), uriBaseId: z.string().optional() });
const SarifShape = z.object({
  $schema: z.string().url(),
  version: z.literal('2.1.0'),
  runs: z
    .array(
      z.object({
        tool: z.object({
          driver: z.object({
            name: z.string().min(1),
            version: z.string().optional(),
            informationUri: z.string().url().optional(),
            rules: z.array(
              z.object({
                id: z.string().min(1),
                shortDescription: message.optional(),
                fullDescription: message.optional(),
                helpUri: z.string().url().optional(),
                defaultConfiguration: z
                  .object({ level: z.enum(['none', 'note', 'warning', 'error']) })
                  .optional(),
                properties: z
                  .object({ tags: z.array(z.string()).optional() })
                  .passthrough()
                  .optional(),
              }),
            ),
          }),
        }),
        results: z.array(
          z.object({
            ruleId: z.string().min(1),
            ruleIndex: z.number().int().nonnegative().optional(),
            level: z.enum(['none', 'note', 'warning', 'error']),
            message,
            locations: z
              .array(
                z.object({
                  physicalLocation: z
                    .object({
                      artifactLocation,
                      region: z
                        .object({
                          startLine: z.number().int().min(1),
                          startColumn: z.number().int().min(1).optional(),
                        })
                        .optional(),
                    })
                    .optional(),
                  logicalLocations: z
                    .array(
                      z
                        .object({ name: z.string().min(1), kind: z.string().optional() })
                        .passthrough(),
                    )
                    .optional(),
                }),
              )
              .min(1),
            partialFingerprints: z.record(z.string(), z.string()).optional(),
          }),
        ),
      }),
    )
    .length(1),
});

describe('sarifLevel', () => {
  it('maps tiers to SARIF levels', () => {
    expect(sarifLevel('violation')).toBe('error');
    expect(sarifLevel('likely')).toBe('warning');
    expect(sarifLevel('needs-review')).toBe('note');
  });
});

describe('toSarif', () => {
  const result = sampleResult();
  const log = toSarif(result);
  const run = log.runs[0]!;

  it('has the required SARIF 2.1.0 structure', () => {
    expect(() => SarifShape.parse(log)).not.toThrow();
    expect(log.$schema).toBe(SARIF_SCHEMA_URL);
    expect(run.tool.driver).toMatchObject({
      name: 'Clear A11Y',
      version: '0.1.0',
      informationUri: 'https://github.com/greenpioneersolutions/clear-a11y',
    });
    expect(JSON.parse(sarifToString(log))).toEqual(log);
  });

  it('emits one result per finding, with fingerprints and levels', () => {
    expect(run.results).toHaveLength(result.findings.length);
    for (const [i, f] of result.findings.entries()) {
      const r = run.results[i]!;
      expect(r.ruleId).toBe(f.ruleId);
      expect(r.level).toBe(sarifLevel(f.tier));
      expect(r.partialFingerprints).toEqual({ [FINGERPRINT_KEY]: f.id });
      expect(run.tool.driver.rules[r.ruleIndex!]!.id).toBe(f.ruleId);
      expect(r.properties).toMatchObject({
        tier: f.tier,
        confidence: f.confidence,
        state: f.page.state,
        viewport: f.page.viewport,
      });
    }
    const review = run.results.find((r) => r.level === 'note')!;
    expect(review.properties?.['question']).toBe(
      'Can keyboard users skip this navigation some other way?',
    );
  });

  it('builds rules from ruleIds with tags, WCAG and help links', () => {
    expect(run.tool.driver.rules.map((r) => r.id)).toEqual([
      'keyboard/focus-order-backward',
      'keyboard/skip-link-missing',
      'static/image-alt',
    ]);
    const focus = run.tool.driver.rules[0]!;
    expect(focus.helpUri).toBe('https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html');
    expect(focus.properties).toMatchObject({
      wcag: ['2.4.3', '1.3.2'],
      tier: 'likely',
      engine: 'engine-keyboard',
      tags: ['accessibility', 'wcag/2.4.3', 'wcag/1.3.2', 'tier/likely'],
    });
    const img = run.tool.driver.rules[2]!;
    expect(img.helpUri).toBe(
      'https://dequeuniversity.com/rules/axe/4.10/image-alt?application=axeAPI',
    );
  });

  it('uses rule metadata titles when given', () => {
    const withMeta = toSarif(result, {
      rules: [
        {
          id: 'keyboard/focus-order-backward',
          engine: 'engine-keyboard',
          wcag: ['2.4.3'],
          tier: 'likely',
          title: 'Focus order jumps backward',
          description: 'Tab goes back up.',
          fix: 'Match DOM order to visual order.',
        },
      ],
      toolVersion: '9.9.9',
    });
    const rule = withMeta.runs[0]!.tool.driver.rules[0]!;
    expect(rule.shortDescription?.text).toBe('Focus order jumps backward');
    expect(rule.fullDescription?.text).toBe('Tab goes back up.');
    expect(withMeta.runs[0]!.tool.driver.version).toBe('9.9.9');
  });

  it('records engine errors as tool execution notifications', () => {
    const failed = toSarif({
      ...result,
      errors: [
        {
          url: 'http://x/',
          state: 'default',
          viewport: 'desktop',
          engine: 'engine-at',
          message: 'boom',
        },
      ],
    });
    const inv = failed.runs[0]!.invocations![0]!;
    expect(inv.executionSuccessful).toBe(false);
    expect(inv.toolExecutionNotifications![0]!.message.text).toContain('boom');
  });
});

describe('sarifLocation', () => {
  const [focus, img] = sampleFindings();

  it('uses a physical file location when the finding has a source', () => {
    const loc = sarifLocation(img!);
    expect(loc.physicalLocation).toEqual({
      artifactLocation: { uri: 'src/pages/Home.tsx' },
      region: { startLine: 12, startColumn: 5 },
    });
  });

  it('falls back to the page URL plus a logical location with selector and state', () => {
    const loc = sarifLocation(focus!);
    expect(loc.physicalLocation).toEqual({
      artifactLocation: { uri: 'http://127.0.0.1:4173/form.html' },
    });
    expect(loc.logicalLocations![0]).toMatchObject({
      name: '#last-name',
      kind: 'element',
      properties: { state: 'default', viewport: 'desktop' },
    });
  });

  it('makes absolute source paths repo-relative', () => {
    expect(sourceUri('/repo/src/a.tsx', '/repo')).toEqual({ uri: 'src/a.tsx', relative: true });
    expect(sourceUri('/elsewhere/a.tsx', '/repo').uri).toBe('file:///elsewhere/a.tsx');
    expect(sourceUri('./src/a.tsx')).toEqual({ uri: 'src/a.tsx', relative: true });
    const log = toSarif(sampleResult([{ ...img!, source: { file: '/repo/src/a.tsx', line: 3 } }]), {
      repoRoot: '/repo',
    });
    expect(log.runs[0]!.results[0]!.locations[0]!.physicalLocation!.artifactLocation).toEqual({
      uri: 'src/a.tsx',
      uriBaseId: 'SRCROOT',
    });
    expect(log.runs[0]!.originalUriBaseIds).toEqual({ SRCROOT: { uri: 'file:///repo/' } });
  });
});
