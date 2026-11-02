import { createFinding, summarize, type Finding } from '@clear-a11y/core';
import { hostileFinding, sampleFindings, sampleResult } from '../../test/sample.js';
import { escapeMarkdown, markdownCode, markdownLink, truncate } from './escape.js';
import { toMarkdownSummary } from './summary.js';

/** Payloads aimed at Markdown/HTML rendering in a job summary or PR comment. */
const MD = {
  html: '<img src=x onerror=alert(1)><details open>',
  link: '[click me](https://evil.example/phish)',
  image: '![x](https://evil.example/pixel.png)',
  table: 'a | b | c',
  heading: 'line one\n# Owned heading\n\n- injected item',
  mention: '@octocat and @org/team, see #1',
  code: 'a`b``c```d',
  close: '</details></summary></table>',
};
const HOSTILE = Object.values(MD).join(' ');

/** Pipes that GitHub would treat as cell separators (not backslash-escaped). */
const cellPipes = (line: string) => (line.match(/(?<!\\)\|/g) ?? []).length;

function hostileMarkdownFinding(): Finding {
  return createFinding({
    ruleId: 'static/label',
    wcag: ['4.1.2'],
    tier: 'needs-review',
    confidence: 0.6,
    engine: 'engine-static',
    page: { url: `http://127.0.0.1/${MD.link}`, state: MD.table, viewport: 'desktop' },
    target: { selector: `#x ${MD.code} ${MD.table}`, name: HOSTILE },
    message: `Label missing ${HOSTILE}`,
    question: `Is it labelled? ${HOSTILE}`,
    evidence: {},
  });
}

describe('escapeMarkdown', () => {
  it('neutralizes HTML, links, images, headings, tables and mentions', () => {
    const out = escapeMarkdown(HOSTILE, 10_000);
    expect(out).not.toMatch(/<[a-z/]/i);
    expect(out).not.toContain('](');
    expect(out).not.toContain('![');
    expect(out).not.toContain('\n');
    expect(cellPipes(out)).toBe(0);
    expect(out).not.toMatch(/@[a-z]/i);
    expect(out).toContain('@\u200Boctocat');
    expect(out).not.toMatch(/(?<!\\)`/);
  });

  it('truncates long text', () => {
    expect(escapeMarkdown('x'.repeat(400)).length).toBeLessThanOrEqual(300);
    expect(truncate('abcdef', 4)).toBe('abc…');
  });

  it('wraps code in a fence longer than any backtick run', () => {
    expect(markdownCode(MD.code)).toBe('````a`b``c```d````');
    expect(markdownCode('`x`')).toBe('`` `x` ``');
    expect(markdownCode('a | b')).toBe('`a \\| b`');
    expect(markdownCode('a | b', 120, false)).toBe('`a | b`');
    expect(markdownCode('')).toBe('');
  });

  it('only links http(s) URLs', () => {
    expect(markdownLink('1.1.1', 'https://www.w3.org/x.html')).toBe(
      '[1\\.1\\.1](https://www.w3.org/x.html)',
    );
    expect(markdownLink('x', 'javascript:alert(1)')).toBe('x');
  });
});

describe('toMarkdownSummary', () => {
  it('counts by tier and lists findings with WCAG links', () => {
    const md = toMarkdownSummary(sampleResult(), {
      reportNote: 'Download the "clear-a11y-report" artifact and open report.html.',
      notes: ['Scanned 2 routes from 3 changed files.'],
    });
    expect(md).toMatch(/^## Clear A11Y accessibility scan/);
    expect(md).toContain('**1 violation** found in 2 scanned pages or files.');
    expect(md).toContain('| Violation | 1 |');
    expect(md).toContain('| Likely | 1 |');
    expect(md).toContain('| Needs review | 1 |');
    expect(md).toContain(
      '[1\\.1\\.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)',
    );
    expect(md).toContain('`src/pages/Home.tsx:12`');
    expect(md).toContain('`http://127.0.0.1:4173/a.html [menu-open]`');
    expect(md).toContain('Can keyboard users skip this navigation some other way?');
    expect(md).toContain('<summary>Needs review: 1 question for a person</summary>');
    expect(md).toContain('\\- Scanned 2 routes'.slice(2)); // note rendered as a list item
    expect(md).toContain('Download the &quot;clear\\-a11y\\-report&quot; artifact');
    // Violations come first.
    const rows = md.split('\n').filter((l) => /^\| (Violation|Likely|Needs review) \| `/.test(l));
    expect(rows[0]).toMatch(/^\| Violation/);
  });

  it('says when there is nothing to report', () => {
    const md = toMarkdownSummary(sampleResult([]));
    expect(md).toContain('No findings in 2 scanned pages or files.');
    expect(md).not.toContain('### Findings');
    expect(md).not.toContain('<details>');
  });

  it('caps the findings table and the question list', () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      createFinding({
        ruleId: 'keyboard/x',
        wcag: ['2.4.3'],
        tier: 'needs-review',
        confidence: 0.5,
        engine: 'engine-keyboard',
        page: { url: `http://127.0.0.1/p${i}` },
        target: { selector: `#e${i}` },
        message: `Finding ${i}`,
        question: `Question ${i}?`,
        evidence: {},
      }),
    );
    const md = toMarkdownSummary(sampleResult(many), { maxFindings: 3, maxQuestions: 2 });
    expect(md).toContain('### Top 3 of 7 findings');
    expect(md).toContain('… and 4 more in the full report.');
    expect(md).toContain('- … and 5 more in the full report.');
    expect(md.split('\n').filter((l) => l.startsWith('| Needs review | `'))).toHaveLength(3);
  });

  it('lists scan errors in a collapsed section', () => {
    const result = {
      ...sampleResult(sampleFindings()),
      errors: [
        {
          url: 'http://127.0.0.1/a',
          state: 'default',
          viewport: 'desktop',
          engine: 'engine-visual',
          message: `timed out ${MD.html}`,
        },
      ],
    };
    const md = toMarkdownSummary(result);
    expect(md).toContain('<summary>1 scan error or coverage gap</summary>');
    expect(md).toContain('timed out &lt;img');
  });

  it('escapes every page-derived field of a hostile finding', () => {
    const findings = [hostileMarkdownFinding(), hostileFinding()];
    const result = { ...sampleResult(findings), summary: summarize(findings) };
    const md = toMarkdownSummary(result);

    // The only HTML is our own <details>/<summary> wrapper. Code spans show their content
    // literally (no HTML), so they are removed before looking for tags.
    const prose = md.replace(/(?<!\\)(`+)[^`][\s\S]*?\1(?!`)/g, '');
    expect(prose).toContain('&lt;img src\\=x onerror');
    expect(prose).not.toContain('<img');
    const tags = prose.match(/<\/?[a-z][^>]*>/gi) ?? [];
    expect(new Set(tags)).toEqual(new Set(['<details>', '</details>', '<summary>', '</summary>']));
    expect(md.match(/<details>/g)).toHaveLength(md.match(/<\/details>/g)?.length ?? -1);
    // No links or images except W3C Understanding links.
    for (const m of prose.matchAll(/\]\(<?([^)>]*)/g))
      expect(m[1]).toMatch(/^https:\/\/www\.w3\.org\//);
    expect(prose).not.toContain('![');
    expect(prose).not.toContain('evil.example/phish)');
    // No injected headings, list items or mentions.
    for (const line of md.split('\n')) {
      expect(line).not.toMatch(/^#+ Owned/);
      expect(line).not.toMatch(/^- injected/);
    }
    expect(md).not.toMatch(/@(octocat|org)/);
    // Every table row keeps exactly six cells.
    for (const line of md.split('\n').filter((l) => l.startsWith('| ') && l.includes('`')))
      expect(cellPipes(line)).toBe(7);
  });
});
