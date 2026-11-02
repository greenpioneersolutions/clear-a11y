import { rules } from '../rules/index.js';
import { problemsToFindings } from './findings.js';
import type { Problem } from './types.js';

const page = { url: 'http://127.0.0.1/w.html', state: 'default', viewport: 'desktop' };
const p = (over: Partial<Problem>): Problem => ({
  ruleId: 'widgets/menu-keyboard',
  wcag: ['2.1.1'],
  tier: 'violation',
  confidence: 0.9,
  selector: '#btn',
  message: 'Items unreachable.',
  ...over,
});

describe('problemsToFindings', () => {
  it('merges problems on the same rule and target; the most severe tier leads', () => {
    const [f, ...rest] = problemsToFindings(
      [
        p({ tier: 'needs-review', message: 'ArrowDown does nothing.', question: 'OK?' }),
        p({
          data: {
            steps: [
              { key: 'start', focused: '#btn' },
              { key: 'ArrowDown', focused: null },
            ],
          },
        }),
      ],
      page,
      rules,
    );
    expect(rest).toEqual([]);
    expect(f).toMatchObject({
      ruleId: 'widgets/menu-keyboard',
      tier: 'violation',
      wcag: ['2.1.1'],
      engine: 'engine-widgets',
      target: { selector: '#btn' },
      message: 'Items unreachable. Also worth reviewing: ArrowDown does nothing.',
      evidence: { focusPath: [{ index: 0, selector: '#btn', name: 'start' }] },
    });
    expect(f?.question).toBeUndefined();
    expect(f?.fix).toContain('aria-haspopup');
  });

  it('keeps the question on needs-review findings and separates targets', () => {
    const findings = problemsToFindings(
      [p({ tier: 'needs-review', question: 'Is this fine?' }), p({ selector: '#other' })],
      page,
      rules,
    );
    expect(findings.map((f) => [f.target.selector, f.tier, f.question])).toEqual([
      ['#btn', 'needs-review', 'Is this fine?'],
      ['#other', 'violation', undefined],
    ]);
  });
});
