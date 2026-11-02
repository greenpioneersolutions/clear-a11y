import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostileFinding, sampleFindings, sampleResult } from '../../test/sample.js';
import { screenshotDataUri } from './screenshot.js';
import { sortFindings, toHtml } from './to-html.js';

// Smallest valid PNG (1x1 transparent).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function reportDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'clear-a11y-html-'));
  mkdirSync(join(dir, 'artifacts'));
  writeFileSync(join(dir, 'artifacts', 'hero.png'), PNG);
  writeFileSync(join(dir, 'secret.png'), PNG);
  return dir;
}

/** Tags in the document, with quoted attribute values removed (escaping keeps `"` out of them). */
const tagsWithoutValues = (html: string) =>
  (html.replace(/"[^"]*"/g, '""').match(/<[a-zA-Z][^>]*>/g) ?? []).join('\n');

describe('toHtml', () => {
  const dir = reportDir();
  const html = toHtml(sampleResult(), { artifactsDir: dir });

  it('is a complete, landmarked, self-contained document', () => {
    expect(html).toMatch(/^<!doctype html>\n<html lang="en"/);
    expect(html).toContain(
      '<title>Accessibility report: 2 targets (3 findings) – Clear A11Y</title>',
    );
    expect(html).toContain('<a class="skip-link" href="#main">');
    expect(html).toContain('<header class="site">');
    expect(html).toContain('<nav class="toc" aria-label="Report sections">');
    expect(html).toContain('<main id="main" tabindex="-1">');
    expect(html).toContain('<footer class="site">');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    // No external resources: no stylesheet links, remote src, CSS url() or imports.
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/\ssrc="(?!data:image\/)/);
    expect(html).not.toMatch(/url\((?!#)|@import/);
    expect(html).toContain(
      `content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`,
    );
  });

  it('keeps a logical heading outline: h2 per tier, h3 per SC, h4 per finding', () => {
    const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++)
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    expect(html).toContain('<h2 id="tier-violation-h">Violations (1)</h2>');
    expect(html).toMatch(
      /<h3 id="violation-sc-1-1-1-h">WCAG <a href="https:\/\/www\.w3\.org\/WAI\/WCAG22\/Understanding\/non-text-content\.html">1\.1\.1 Non-text Content<\/a>/,
    );
    expect(html.match(/<h4 /g)).toHaveLength(3);
  });

  it('summarises by tier, SC (with Understanding links) and engine', () => {
    expect(html).toContain(
      '3 findings across 2 page views (1 violation, 1 likely, 1 needs review)',
    );
    expect(html).toContain('<caption>Findings by WCAG success criterion</caption>');
    expect(html).toContain('Understanding/bypass-blocks.html">2.4.1 Bypass Blocks</a>');
    expect(html).toContain('<th scope="row">engine-keyboard</th><td class="num">2</td>');
  });

  it('renders each finding with message, who it affects, fix, selector and context', () => {
    expect(html).toContain('<p class="message">Images must have alternative text</p>');
    expect(html).toContain('<dt>Who it affects</dt><dd>Blind and low-vision people');
    expect(html).toContain('<dt>How to fix</dt><dd>Add an alt attribute.');
    expect(html).toContain('<code>#hero</code>');
    expect(html).toContain('State: menu-open · Viewport: mobile');
    expect(html).toContain('<code>src/pages/Home.tsx:12:5</code> (Home)');
    expect(html).toContain('confidence 95%');
    expect(html).toContain('<summary>Accessibility tree</summary>');
    expect(html).toContain('<summary>HTML snippet</summary><pre><code>&lt;img id=&quot;hero&quot;');
    expect(html).toContain('<summary>Screen reader announcement</summary>');
  });

  it('inlines screenshots from the report directory with meaningful alt text', () => {
    expect(html).toContain(`src="data:image/png;base64,${PNG.toString('base64')}"`);
    expect(html).toContain('alt="Screenshot crop of the element #hero on 127.0.0.1:4173/a.html');
    expect(screenshotDataUri('memory:x.png', dir)).toBeUndefined();
    expect(screenshotDataUri('../secret.png', join(dir, 'artifacts'))).toBeUndefined();
    expect(screenshotDataUri('artifacts/missing.png', dir)).toBeUndefined();
    expect(screenshotDataUri('report.json', dir)).toBeUndefined();
    expect(screenshotDataUri('artifacts/hero.png', undefined)).toBeUndefined();
    const capped = toHtml(sampleResult(), { artifactsDir: dir, maxScreenshots: 0 });
    expect(capped).not.toContain('data:image/png');
    expect(capped).toContain('this report embeds at most 0 screenshots');
  });

  it('draws the focus path with a text alternative', () => {
    expect(html).toContain('Focus path: 4 stops, 1 backward jump.');
    expect(html).toContain('backward jump</strong> from 2. Country (combobox)');
  });

  it('lists needs-review questions as fieldsets with Yes/No radios and a download button', () => {
    expect(html).toMatch(
      /<fieldset class="question" id="question-3"[^>]*><legend>Question 3: Can keyboard users skip this navigation some other way\?<\/legend>/,
    );
    expect(html).toContain('<input type="radio" name="answer-3" value="yes"> Yes');
    expect(html).toContain('<input type="radio" name="answer-3" value="no"> No');
    expect(html).toContain(
      '<button type="button" id="download-answers" hidden>Download answers (JSON)</button>',
    );
    expect(html).toContain('localStorage');
    expect(html).toContain('new Blob(');
  });

  it('hides filters until the script enables them', () => {
    expect(html).toContain(
      '<section id="filters" class="filters" aria-labelledby="filters-h" hidden>',
    );
    expect(html).toContain(
      '<p id="filter-status" class="status" role="status">Showing all 3 findings.</p>',
    );
  });

  it('is deterministic and independent of finding order', () => {
    const reversed = sampleResult([...sampleFindings()].reverse());
    expect(toHtml(reversed, { artifactsDir: dir })).toBe(html);
    expect(sortFindings(reversed.findings).map((f) => f.tier)).toEqual([
      'violation',
      'likely',
      'needs-review',
    ]);
  });

  it('renders an empty scan without errors', () => {
    const empty = toHtml(sampleResult([]));
    expect(empty).toContain('No findings in this tier.');
    expect(empty).toContain('No questions to answer in this scan.');
    expect(empty).not.toContain('id="filters"');
  });
});

describe('toHtml with hostile page content', () => {
  const html = toHtml(sampleResult([hostileFinding()]));

  it('escapes every page-derived string', () => {
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/<\/style><script>/);
    expect(html.match(/<script[ >]/g)).toHaveLength(1);
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('produces no event-handler attributes, javascript: links or injected images', () => {
    expect(tagsWithoutValues(html)).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toContain('<img');
    expect(html).toContain('javascript:alert(3)'); // shown as text, not linked
  });
});
