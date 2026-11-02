import {
  createFinding,
  SCAN_RESULT_SCHEMA_VERSION,
  summarize,
  type Finding,
  type ScanResult,
} from '@clear-a11y/core';

/** 1x1 transparent PNG. */
export const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function sampleFindings(url = 'http://127.0.0.1:4173/form.html'): Finding[] {
  return [
    createFinding({
      ruleId: 'keyboard/focus-order-backward',
      wcag: ['2.4.3'],
      tier: 'likely',
      confidence: 0.75,
      engine: 'engine-keyboard',
      page: { url },
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
      page: { url },
      target: { selector: '#logo' },
      message: 'Image has no text alternative.',
      fix: 'Add an alt attribute that says what the image shows.',
      evidence: { screenshot: PNG_DATA_URI, html: '<img id="logo" src="logo.png">' },
    }),
    createFinding({
      ruleId: 'keyboard/skip-link-missing',
      wcag: ['2.4.1'],
      tier: 'needs-review',
      confidence: 0.5,
      engine: 'engine-keyboard',
      page: { url },
      target: { selector: 'body' },
      message: 'No skip link before the repeated navigation.',
      question: 'Is there another way to bypass the repeated navigation on this page?',
    }),
    createFinding({
      ruleId: 'at/landmark-unlabelled',
      wcag: ['1.3.1'],
      tier: 'needs-review',
      confidence: 0.5,
      engine: 'engine-at',
      page: { url },
      target: { selector: 'nav:nth-of-type(2)' },
      message: 'Two navigation landmarks share no label.',
      question: 'Can a screen reader user tell the two navigation regions apart?',
    }),
  ];
}

export function sampleResult(url = 'http://127.0.0.1:4173/form.html'): ScanResult {
  const findings = sampleFindings(url);
  return {
    schemaVersion: SCAN_RESULT_SCHEMA_VERSION,
    tool: { name: 'clear-a11y', version: '0.0.0' },
    startedAt: '2026-10-31T10:00:00.000Z',
    finishedAt: '2026-10-31T10:00:05.000Z',
    targets: [url],
    pages: [{ url, viewport: 'desktop', states: ['default'] }],
    findings,
    errors: [],
    summary: summarize(findings),
  };
}
