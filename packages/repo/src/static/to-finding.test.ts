import { FindingSchema } from '@clear-a11y/core';
import { Linter } from 'eslint';
import { describeElement } from './element.js';
import { jsxConfig, vueConfig } from './eslint-config.js';
import { lintSource, normalizeRuleId, type LintMessage } from './lint.js';
import { selectorFor, toFinding, toFindings } from './to-finding.js';

const linter = new Linter({ configType: 'flat', cwd: '/repo' });
const configs = [...jsxConfig(), ...vueConfig()];
const lint = (code: string, file = 'src/Card.tsx') => lintSource(linter, configs, code, file);
const findings = (code: string, file?: string) => toFindings(lint(code, file).messages);

describe('lintSource', () => {
  it('reports file, line, column, element and enclosing component', () => {
    const r = lint(
      [
        'export function Card() {',
        '  const renderImage = () => <img src="/a.png" className="hero" />;',
        '  return <div>{renderImage()}</div>;',
        '}',
      ].join('\n'),
    );
    expect(r.error).toBeUndefined();
    const m = r.messages.find((x) => x.lintRuleId === 'jsx-a11y/alt-text');
    expect(m).toMatchObject({ file: 'src/Card.tsx', line: 2, column: 29, component: 'Card' });
    expect(m?.element).toMatchObject({ tag: 'img', hasSpread: false, isDomElement: true });
    expect(m?.snippet).toBe('<img src="/a.png" className="hero" />');
  });

  it('finds components declared as arrow functions and classes', () => {
    const arrow = lint('export const Hero = () => <img src="a" />;');
    expect(arrow.messages[0]?.component).toBe('Hero');
    const cls = lint(
      'export class Banner extends Component { render() { return <img src="a" />; } }',
    );
    expect(cls.messages[0]?.component).toBe('Banner');
  });

  it('ignores inline eslint-disable comments and config comments', () => {
    const r = lint(
      [
        '/* eslint jsx-a11y/alt-text: "off" */',
        'export const A = () => (',
        '  // eslint-disable-next-line jsx-a11y/alt-text',
        '  <img src="a" />',
        ');',
      ].join('\n'),
    );
    expect(r.messages.map((m) => m.lintRuleId)).toContain('jsx-a11y/alt-text');
  });

  it('turns parse errors into an error, not findings', () => {
    const r = lint('export const A = () => <div');
    expect(r.messages).toEqual([]);
    expect(r.error).toMatch(/Parsing error/);
  });

  it('lints Vue single-file components', () => {
    const r = lint(
      '<template>\n  <div>\n    <img :src="x" v-bind="attrs">\n  </div>\n</template>\n',
      'src/Tile.vue',
    );
    const m = r.messages.find((x) => x.lintRuleId === 'vuejs-accessibility/alt-text');
    expect(m).toMatchObject({ line: 3, component: 'Tile' });
    expect(m?.element).toMatchObject({ tag: 'img', hasSpread: true, syntax: 'vue' });
  });

  it('accepts a Vue label associated by for/id (not only by nesting)', () => {
    const r = lint(
      '<template>\n  <label for="q">Qty</label>\n  <input id="q" type="number">\n</template>\n',
      'src/Ok.vue',
    );
    expect(r.messages).toEqual([]);
  });
});

describe('toFinding', () => {
  it('normalizes a lint message into a canonical repo finding', () => {
    const [f] = findings('export function Card() {\n  return <img src="/a.png" />;\n}\n');
    expect(f).toBeDefined();
    expect(() => FindingSchema.parse(f)).not.toThrow();
    expect(f).toMatchObject({
      ruleId: 'repo/jsx-a11y/alt-text',
      engine: 'repo-eslint',
      wcag: ['1.1.1'],
      tier: 'violation',
      page: { url: 'repo:src/Card.tsx', state: 'source', viewport: 'none' },
      target: { selector: '<img src="/a.png">' },
      source: { file: 'src/Card.tsx', line: 2, column: 10, component: 'Card' },
      evidence: { html: '<img src="/a.png" />', data: { lintRule: 'jsx-a11y/alt-text' } },
    });
    // Plain-language message and fix from the rule map, not the raw lint text.
    expect(f?.message).toMatch(/screen reader/);
    expect(f?.message).not.toMatch(/must have an alt prop/);
    expect(f?.fix).toMatch(/alt=""/);
  });

  it('keeps spread-prop elements at likely: the missing attribute may come from props', () => {
    const [f] = findings('export const T = (p) => <img {...p} />;');
    expect(f).toMatchObject({ tier: 'likely', target: { selector: '<img {...}>' } });
  });

  it('makes autofocus needs-review with a question', () => {
    const [f] = findings('export const F = () => <input id="q" autoFocus />;');
    expect(f).toMatchObject({ ruleId: 'repo/jsx-a11y/no-autofocus', tier: 'needs-review' });
    expect(f?.question).toMatch(/\?$/);
    expect(f?.target.selector).toBe('<input id="q" autoFocus>');
  });

  it('gives identical elements in one file distinct, line-independent ids', () => {
    const code = 'export const A = () => <div><img src="a" /><img src="a" /></div>;';
    const [a, b] = findings(code);
    expect(a?.id).not.toBe(b?.id);
    const moved = findings(`\n\n${code}`);
    expect(moved.map((f) => f.id)).toEqual([a?.id, b?.id]);
  });

  it('drops rules that are not in the map', () => {
    const msg: LintMessage = {
      file: 'a.tsx',
      lintRuleId: 'jsx-a11y/no-redundant-roles',
      line: 1,
      column: 1,
      message: 'x',
    };
    expect(toFinding(msg)).toBeUndefined();
    expect(selectorFor(msg)).toBe('a.tsx:1:1');
  });

  it('normalizes Angular rule ids', () => {
    expect(normalizeRuleId('@angular-eslint/template/alt-text')).toBe('angular-template/alt-text');
    expect(normalizeRuleId('jsx-a11y/alt-text')).toBe('jsx-a11y/alt-text');
  });
});

describe('describeElement', () => {
  it('lists key attributes, the first handler and spread props, truncating long values', () => {
    expect(
      describeElement({
        tag: 'div',
        attributes: { onClick: '{…}', className: 'x'.repeat(60), 'data-x': 'y' },
        hasSpread: true,
        isDomElement: true,
        syntax: 'jsx',
      }),
    ).toBe(`<div className="${'x'.repeat(39)}…" onClick={…} {...}>`);
    expect(
      describeElement({
        tag: 'img',
        attributes: { src: '{…}' },
        hasSpread: false,
        isDomElement: true,
        syntax: 'angular',
      }),
    ).toBe('<img [src]>');
  });
});
