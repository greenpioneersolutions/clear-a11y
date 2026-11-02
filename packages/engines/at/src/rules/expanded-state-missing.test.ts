import type { ChangedElement } from '../lib/recorder.js';
import {
  declaresExpandedState,
  detectExpandedStateMissing,
  expandedStateMissingRule,
} from './expanded-state-missing.js';

const el = (over: Partial<ChangedElement> = {}): ChangedElement => ({
  selector: '#panel',
  text: 'Two to four working days.',
  isPopup: false,
  hasFocusable: false,
  insideTrigger: false,
  inLiveRegion: false,
  hasFocus: false,
  ...over,
});

describe('at/expanded-state-missing', () => {
  it('has rule metadata', () => {
    expect(expandedStateMissingRule.id).toBe('at/expanded-state-missing');
    expect(expandedStateMissingRule.wcag).toEqual(['4.1.2']);
    expect(expandedStateMissingRule.tier).toBe('violation');
  });

  it('detects a button that toggles a section back and forth without a state', () => {
    expect(
      detectExpandedStateMissing({
        declaresState: false,
        shown: [el()],
        hidden: [],
        reverted: true,
      }),
    ).toBe(true);
    // Collapsing first (content starts open) counts too.
    expect(
      detectExpandedStateMissing({
        declaresState: false,
        shown: [],
        hidden: [el()],
        reverted: true,
      }),
    ).toBe(true);
  });

  it('does not flag the correct pattern (aria-expanded present)', () => {
    expect(
      detectExpandedStateMissing({
        declaresState: true,
        shown: [el()],
        hidden: [],
        reverted: true,
      }),
    ).toBe(false);
  });

  it('ignores one-way changes, dialogs and the button swapping its own icon', () => {
    expect(
      detectExpandedStateMissing({
        declaresState: false,
        shown: [el()],
        hidden: [],
        reverted: false,
      }),
    ).toBe(false);
    expect(
      detectExpandedStateMissing({
        declaresState: false,
        shown: [el({ isPopup: true })],
        hidden: [],
        reverted: true,
      }),
    ).toBe(false);
    expect(
      detectExpandedStateMissing({
        declaresState: false,
        shown: [el({ insideTrigger: true })],
        hidden: [el({ insideTrigger: true })],
        reverted: true,
      }),
    ).toBe(false);
  });

  it('counts aria-expanded, aria-pressed and popover invokers as declaring a state', () => {
    expect(declaresExpandedState(['class', 'aria-expanded'])).toBe(true);
    expect(declaresExpandedState(['aria-pressed'])).toBe(true);
    // The browser exposes expanded on a popovertarget button (HTML-AAM), no ARIA needed.
    expect(declaresExpandedState(['popovertarget', 'class'])).toBe(true);
    expect(declaresExpandedState(['PopoverTarget'])).toBe(true);
    expect(declaresExpandedState(['aria-controls', 'class', 'type'])).toBe(false);
  });
});
