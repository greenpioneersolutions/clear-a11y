import { getSuccessCriterion } from '@clear-a11y/core';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import vueA11y from 'eslint-plugin-vuejs-accessibility';
import type { Linter } from 'eslint';
import { jsxConfig, vueConfig } from './eslint-config.js';
import { enabledRules, RULE_MAP, SKIPPED_RULES, tierFor } from './rule-map.js';

const isOn = (v: unknown) =>
  (Array.isArray(v) ? v[0] : v) !== 'off' && (Array.isArray(v) ? v[0] : v) !== 0;
const enabledIn = (configs: Linter.Config[]) =>
  configs.flatMap((c) =>
    Object.entries(c.rules ?? {})
      .filter(([, v]) => isOn(v))
      .map(([k]) => k),
  );

describe('rule map', () => {
  it('maps every rule we enable to valid, non-obsolete WCAG success criteria', () => {
    const enabled = [...enabledIn(jsxConfig()), ...enabledIn(vueConfig())];
    expect(enabled.length).toBeGreaterThan(30);
    for (const id of enabled) {
      const entry = RULE_MAP[id];
      expect(entry, `${id} has no WCAG mapping`).toBeDefined();
      expect(entry?.wcag.length).toBeGreaterThan(0);
      for (const sc of entry?.wcag ?? []) {
        const info = getSuccessCriterion(sc);
        expect(info, `${id}: unknown SC ${sc}`).toBeDefined();
        expect(info?.removed).not.toBe(true);
      }
    }
  });

  it('accounts for every recommended jsx-a11y and vuejs-accessibility rule (mapped or skipped with a reason)', () => {
    const jsxRecommended = Object.entries(jsxA11y.flatConfigs.recommended.rules ?? {})
      .filter(([, v]) => isOn(v))
      .map(([k]) => k);
    const vueRecommended = enabledIn(vueA11y.configs['flat/recommended'] as Linter.Config[]);
    for (const id of [...jsxRecommended, ...vueRecommended]) {
      expect(
        RULE_MAP[id] ?? SKIPPED_RULES[id],
        `${id} is neither mapped nor skipped`,
      ).toBeDefined();
    }
    for (const id of Object.keys(SKIPPED_RULES)) expect(RULE_MAP[id]).toBeUndefined();
  });

  it('only enables rules the plugins actually define', () => {
    for (const id of enabledRules('jsx-a11y'))
      expect(jsxA11y.rules?.[id.slice('jsx-a11y/'.length)], id).toBeDefined();
    for (const id of enabledRules('vuejs-accessibility'))
      expect(
        (vueA11y.rules as Record<string, unknown>)[id.slice('vuejs-accessibility/'.length)],
        id,
      ).toBeDefined();
  });

  it('gives every needs-review rule a yes/no question and never defaults to violation', () => {
    for (const [id, entry] of Object.entries(RULE_MAP)) {
      expect(['likely', 'needs-review']).toContain(entry.tier);
      if (entry.tier === 'needs-review') expect(entry.question, id).toMatch(/\?$/);
      expect(entry.message.length, id).toBeGreaterThan(20);
      expect(entry.fix.length, id).toBeGreaterThan(10);
    }
  });

  it('upgrades to violation only for unambiguous source', () => {
    const alt = RULE_MAP['jsx-a11y/alt-text'];
    if (!alt) throw new Error('missing');
    const img = (hasSpread: boolean, tag = 'img') => ({
      tag,
      attributes: { src: '/a.png' },
      hasSpread,
      isDomElement: /^[a-z]+$/.test(tag),
    });
    const missing =
      'img elements must have an alt prop, either with meaningful text, or an empty string for decorative images.';
    expect(tierFor(alt, { element: img(false), lintMessage: missing })).toBe('violation');
    expect(tierFor(alt, { element: img(true), lintMessage: missing })).toBe('likely');
    expect(tierFor(alt, { element: img(false, 'Image'), lintMessage: missing })).toBe('likely');
    expect(
      tierFor(alt, {
        element: img(false),
        lintMessage: 'Prefer alt="" over a presentational role.',
      }),
    ).toBe('likely');
    expect(tierFor(alt, { lintMessage: missing })).toBe('likely');

    const role = RULE_MAP['jsx-a11y/aria-role'];
    if (!role) throw new Error('missing');
    const div = (roleValue: string) => ({
      tag: 'div',
      attributes: { role: roleValue },
      hasSpread: false,
      isDomElement: true,
    });
    expect(tierFor(role, { element: div('buton'), lintMessage: '' })).toBe('violation');
    expect(tierFor(role, { element: div('{…}'), lintMessage: '' })).toBe('likely');
  });
});
