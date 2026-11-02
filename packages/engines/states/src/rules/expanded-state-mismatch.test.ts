import {
  detectExpandedStateMismatch,
  expandedStateMismatchRule,
} from './expanded-state-mismatch.js';

describe('states/expanded-state-mismatch', () => {
  it('has rule metadata', () => {
    expect(expandedStateMismatchRule.id).toBe('states/expanded-state-mismatch');
    expect(expandedStateMismatchRule.wcag).toEqual(['4.1.2']);
  });

  it('detects content that opened while aria-expanded stayed false', () => {
    expect(
      detectExpandedStateMismatch({ phase: 'open', expandedAfter: 'false', contentVisible: true }),
    ).toBe(true);
  });

  it('detects content that closed while aria-expanded stayed true', () => {
    expect(
      detectExpandedStateMismatch({ phase: 'close', expandedAfter: 'true', contentVisible: false }),
    ).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(
      detectExpandedStateMismatch({ phase: 'open', expandedAfter: 'true', contentVisible: true }),
    ).toBe(false);
    expect(
      detectExpandedStateMismatch({
        phase: 'close',
        expandedAfter: 'false',
        contentVisible: false,
      }),
    ).toBe(false);
  });

  it('does not flag a trigger whose activation revealed nothing', () => {
    expect(
      detectExpandedStateMismatch({ phase: 'open', expandedAfter: 'false', contentVisible: false }),
    ).toBe(false);
  });
});
