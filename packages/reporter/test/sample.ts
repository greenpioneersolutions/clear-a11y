import { createFinding, summarize, type Finding, type ScanResult } from '@clear-a11y/core';

/** Hostile strings a scanned page could put into a finding. */
export const XSS = {
  script: '<script>alert(1)</script>',
  attr: '"><img src=x onerror=alert(1)>',
  style: '</style><script>alert(2)</script>',
  js: 'javascript:alert(3)',
};

export function sampleFindings(): Finding[] {
  return [
    createFinding({
      ruleId: 'keyboard/focus-order-backward',
      wcag: ['2.4.3', '1.3.2'],
      tier: 'likely',
      confidence: 0.75,
      engine: 'engine-keyboard',
      page: { url: 'http://127.0.0.1:4173/form.html' },
      target: { selector: '#last-name', role: 'textbox', name: 'Last name' },
      message: 'Tab moves from "Country" back up to "Last name".',
      evidence: {
        focusPath: [
          {
            index: 0,
            selector: '#first-name',
            name: 'First name',
            role: 'textbox',
            rect: { x: 0, y: 0, width: 300, height: 40 },
          },
          {
            index: 1,
            selector: '#country',
            name: 'Country',
            role: 'combobox',
            rect: { x: 0, y: 100, width: 620, height: 40 },
          },
          {
            index: 2,
            selector: '#last-name',
            name: 'Last name',
            role: 'textbox',
            rect: { x: 320, y: 0, width: 300, height: 40 },
            backward: true,
          },
          {
            index: 3,
            selector: '#submit',
            name: 'Continue',
            role: 'button',
            rect: { x: 0, y: 180, width: 100, height: 40 },
          },
        ],
      },
    }),
    createFinding({
      ruleId: 'static/image-alt',
      wcag: ['1.1.1'],
      tier: 'violation',
      confidence: 0.95,
      engine: 'engine-static',
      page: { url: 'http://127.0.0.1:4173/a.html' },
      target: { selector: '#hero' },
      message: 'Images must have alternative text',
      fix: 'Add an alt attribute. See https://dequeuniversity.com/rules/axe/4.10/image-alt?application=axeAPI.',
      evidence: { html: '<img id="hero" src="hero.png">', screenshot: 'artifacts/hero.png' },
      source: { file: 'src/pages/Home.tsx', line: 12, column: 5, component: 'Home' },
    }),
    createFinding({
      ruleId: 'keyboard/skip-link-missing',
      wcag: ['2.4.1'],
      tier: 'needs-review',
      confidence: 0.5,
      engine: 'engine-keyboard',
      page: { url: 'http://127.0.0.1:4173/a.html', state: 'menu-open', viewport: 'mobile' },
      target: { selector: '#site-header' },
      message: 'No way to skip the navigation.',
      question: 'Can keyboard users skip this navigation some other way?',
      evidence: { axTree: 'navigation "Main"\n  link "Home"', announcement: 'navigation, Main' },
    }),
  ];
}

export function sampleResult(findings: Finding[] = sampleFindings()): ScanResult {
  return {
    schemaVersion: 1,
    tool: { name: 'clear-a11y', version: '0.1.0' },
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:05.000Z',
    targets: ['http://127.0.0.1:4173/form.html', 'http://127.0.0.1:4173/a.html'],
    pages: [
      { url: 'http://127.0.0.1:4173/form.html', viewport: 'desktop', states: ['default'] },
      {
        url: 'http://127.0.0.1:4173/a.html',
        viewport: 'desktop',
        states: ['default', 'menu-open'],
      },
    ],
    findings,
    errors: [],
    summary: summarize(findings),
  };
}

/** A finding whose every page-derived field carries a hostile payload. */
export function hostileFinding(): Finding {
  return createFinding({
    ruleId: 'static/label',
    wcag: ['4.1.2'],
    tier: 'needs-review',
    confidence: 0.6,
    engine: 'engine-static',
    page: { url: XSS.js, state: XSS.attr, viewport: XSS.script },
    target: { selector: `#${XSS.attr}`, name: XSS.script, role: XSS.attr },
    message: `Label missing ${XSS.script}`,
    fix: `Fix ${XSS.style}`,
    question: `Is ${XSS.attr} labelled?`,
    evidence: {
      html: `<input id='${XSS.attr}'>${XSS.script}`,
      axTree: XSS.style,
      announcement: XSS.script,
      screenshot: `data:image/png;base64,AAAA" onerror="alert(4)`,
      focusPath: [
        {
          index: 0,
          selector: XSS.attr,
          name: XSS.script,
          rect: { x: 0, y: 0, width: 10, height: 10 },
        },
        {
          index: 1,
          selector: XSS.script,
          name: XSS.attr,
          backward: true,
          rect: { x: 0, y: 100, width: 10, height: 10 },
        },
      ],
    },
  });
}
