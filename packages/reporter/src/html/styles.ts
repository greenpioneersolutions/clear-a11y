/**
 * Inline CSS for the HTML report. Colors are tokens checked for WCAG AA in light and dark
 * (text >= 4.5:1, non-text >= 3:1; see styles.test.ts). No external fonts or images.
 */
export const COLORS = {
  light: {
    bg: '#ffffff',
    surface: '#f4f5f7',
    text: '#1b1c20',
    muted: '#4b4f58',
    border: '#767b85',
    link: '#0b57d0',
    focus: '#0b57d0',
    violationBg: '#a4161a',
    violationFg: '#ffffff',
    likelyBg: '#8a4300',
    likelyFg: '#ffffff',
    reviewBg: '#3b3fa6',
    reviewFg: '#ffffff',
    stop: '#0b57d0',
    stopText: '#ffffff',
    back: '#b3261e',
    line: '#4b4f58',
  },
  dark: {
    bg: '#15161a',
    surface: '#202228',
    text: '#ececf1',
    muted: '#b9bcc6',
    border: '#8b909a',
    link: '#9ec1ff',
    focus: '#9ec1ff',
    violationBg: '#ffb4ab',
    violationFg: '#3b0907',
    likelyBg: '#ffc58a',
    likelyFg: '#2b1700',
    reviewBg: '#c8c6ff',
    reviewFg: '#17165c',
    stop: '#9ec1ff',
    stopText: '#0d1b33',
    back: '#ff8f85',
    line: '#b9bcc6',
  },
} as const;

type Palette = (typeof COLORS)['light'] | (typeof COLORS)['dark'];

const vars = (c: Palette) => `
  --bg: ${c.bg}; --surface: ${c.surface}; --text: ${c.text}; --muted: ${c.muted};
  --border: ${c.border}; --link: ${c.link}; --focus: ${c.focus};
  --violation-bg: ${c.violationBg}; --violation-fg: ${c.violationFg};
  --likely-bg: ${c.likelyBg}; --likely-fg: ${c.likelyFg};
  --review-bg: ${c.reviewBg}; --review-fg: ${c.reviewFg};
  --stop: ${c.stop}; --stop-text: ${c.stopText}; --back: ${c.back}; --line: ${c.line};`;

export const STYLES = `
:root {${vars(COLORS.light)}
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {${vars(COLORS.dark)}
  }
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow-wrap: break-word;
}
a { color: var(--link); text-underline-offset: 0.15em; }
a:hover { text-decoration-thickness: 0.15em; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
main:focus { outline: none; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 0.9em; }
code { overflow-wrap: anywhere; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface); padding: 0.75rem; border-radius: 4px; margin: 0.5rem 0 0; }
.visually-hidden {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
.skip-link {
  position: absolute; left: 1rem; top: -100px; z-index: 10;
  display: inline-block; padding: 0.5rem 1rem; min-height: 24px;
  background: var(--bg); color: var(--link); border: 2px solid var(--focus); border-radius: 4px;
}
.skip-link:focus { top: 0.75rem; }
.wrap { max-width: 72rem; margin: 0 auto; padding: 0 1rem; }
header.site { border-bottom: 1px solid var(--border); padding: 1.5rem 0 1rem; }
.brand { margin: 0; font-weight: 600; color: var(--muted); letter-spacing: 0.02em; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0.25rem 0 0.5rem; }
h2 { font-size: 1.5rem; line-height: 1.25; margin: 2.5rem 0 0.75rem; padding-top: 0.5rem; border-top: 2px solid var(--border); }
h3 { font-size: 1.2rem; line-height: 1.3; margin: 1.75rem 0 0.75rem; }
h4 { font-size: 1.05rem; line-height: 1.35; margin: 0 0 0.5rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.lead { margin: 0; color: var(--muted); }
.targets { margin: 0.25rem 0 0.5rem; padding-left: 1.25rem; }
.targets li { margin: 0.15rem 0; overflow-wrap: anywhere; }
nav.toc { padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
nav.toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
nav.toc a { display: inline-block; min-height: 24px; padding: 0.25rem 0; }
.badge {
  display: inline-block; padding: 0.1rem 0.55rem; border-radius: 999px;
  font-size: 0.85rem; font-weight: 700; line-height: 1.5; border: 1px solid transparent;
}
.badge-violation { background: var(--violation-bg); color: var(--violation-fg); }
.badge-likely { background: var(--likely-bg); color: var(--likely-fg); }
.badge-needs-review { background: var(--review-bg); color: var(--review-fg); }
.tiers { margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.tiers > div { border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem; }
.tiers dt { margin-bottom: 0.25rem; }
.tiers dd { margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1.5rem; }
caption { text-align: left; font-weight: 700; padding: 0.25rem 0 0.5rem; }
th, td { text-align: left; vertical-align: top; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
th { font-weight: 700; }
thead th { overflow-wrap: normal; }
td.num, th.num { text-align: right; white-space: nowrap; }
.grid-2 { display: grid; gap: 0 2rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); }
.filters form { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: end; }
.field { display: flex; flex-direction: column; gap: 0.25rem; }
label { font-weight: 600; }
select, button {
  font: inherit; color: var(--text); background: var(--bg);
  min-height: 2.25rem; padding: 0.3rem 0.6rem; border: 1px solid var(--border); border-radius: 4px;
}
button { cursor: pointer; font-weight: 600; }
button:hover { background: var(--surface); }
.status { min-height: 1.5em; color: var(--muted); }
.sc-group > h3 a { font-weight: inherit; }
.finding {
  border: 1px solid var(--border); border-left-width: 6px; border-radius: 6px;
  padding: 1rem; margin: 0 0 1rem; background: var(--bg);
}
.finding[data-tier="violation"] { border-left-color: var(--violation-bg); border-left-style: solid; }
.finding[data-tier="likely"] { border-left-color: var(--likely-bg); border-left-style: double; }
.finding[data-tier="needs-review"] { border-left-color: var(--review-bg); border-left-style: dotted; }
.message { margin: 0 0 0.75rem; font-size: 1.05rem; }
.facts { margin: 0; display: grid; gap: 0.4rem; }
.fact { display: grid; grid-template-columns: minmax(7.5rem, 11rem) 1fr; gap: 0.75rem; }
.fact dt { font-weight: 700; }
.fact dd { margin: 0; min-width: 0; }
@media (max-width: 34rem) { .fact { grid-template-columns: 1fr; gap: 0; } }
.shot, .focus-path { margin: 1rem 0 0; }
.shot img { display: block; max-width: 100%; height: auto; border: 1px solid var(--border); background: #ffffff; }
figcaption { color: var(--muted); font-size: 0.9rem; margin: 0.25rem 0; }
.fp-canvas { position: relative; width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; margin: 0.25rem 0 0; }
.fp-svg { display: block; width: 100%; height: auto; }
.fp-box { fill: none; stroke: var(--border); stroke-width: 1; }
.fp-arrow { stroke: var(--line); stroke-width: 2.5; fill: none; }
.fp-arrow.fp-back { stroke: var(--back); stroke-dasharray: 7 5; }
.fp-head { fill: var(--line); }
.fp-head-back { fill: var(--back); }
.fp-num {
  position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--stop); color: var(--stop-text); border: 2px solid var(--surface);
  font: 700 12px/1 system-ui, sans-serif;
}
.fp-num::before { content: attr(data-n); }
.fp-num-back { background: var(--back); color: var(--bg); }
.fp-back-label {
  position: absolute; transform: translate(-50%, -150%); padding: 0 0.3rem; border-radius: 3px;
  background: var(--bg); color: var(--back); border: 1px dashed var(--back);
  font: 700 12px/1.4 system-ui, sans-serif; white-space: nowrap;
}
@media (max-width: 34rem) {
  .fp-num { width: 20px; height: 20px; margin: -10px 0 0 -10px; font-size: 11px; border-width: 1px; }
  .fp-back-label { font-size: 11px; }
}
.fp-list { margin: 0.5rem 0 0; padding-left: 1.75rem; }
.fp-list li { margin: 0.15rem 0; }
.fp-back-text { color: var(--back); text-decoration: underline dashed; }
details.evidence { margin-top: 0.75rem; }
details.evidence > summary { cursor: pointer; font-weight: 600; min-height: 24px; padding: 0.15rem 0; }
.note { color: var(--muted); font-style: italic; }
.question { border: 1px solid var(--border); border-radius: 6px; margin: 0 0 1rem; padding: 0.75rem 1rem 1rem; }
.question legend { font-weight: 700; padding: 0 0.25rem; }
.question-context { margin: 0.25rem 0 0.25rem; }
.question-link { margin: 0 0 0.75rem; }
.choices { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; }
.choices label { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2rem; font-weight: 600; }
.choices input { width: 1.5rem; height: 1.5rem; margin: 0; accent-color: var(--link); }
footer.site { margin-top: 3rem; padding: 1rem 0 2rem; border-top: 1px solid var(--border); color: var(--muted); }
footer.site p { margin: 0.25rem 0; }
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
@media print {
  :root {${vars(COLORS.light)} }
  body { font-size: 11pt; }
  .skip-link, nav.toc, #filters, .actions, #review-status { display: none !important; }
  .finding, .question, figure { break-inside: avoid; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.85em; }
  h2 { break-after: avoid; }
}
`;
