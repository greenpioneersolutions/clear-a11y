import type { ChangedElement, FocusInfo } from '../lib/recorder.js';
import { detectErrorNotAnnounced, errorNotAnnouncedRule } from './error-not-announced.js';

const err = (over: Partial<ChangedElement> = {}): ChangedElement => ({
  selector: '#email-error',
  text: 'Required',
  isPopup: false,
  hasFocusable: false,
  insideTrigger: false,
  inLiveRegion: false,
  hasFocus: false,
  ...over,
});
const stay: FocusInfo = { before: '#signup > button', after: '#signup > button', kind: 'trigger' };

describe('at/error-not-announced', () => {
  it('has rule metadata', () => {
    expect(errorNotAnnouncedRule.id).toBe('at/error-not-announced');
    expect(errorNotAnnouncedRule.wcag).toEqual(['4.1.3']);
  });

  it('detects errors injected silently while focus stays on the submit button', () => {
    expect(
      detectErrorNotAnnounced({
        errors: [err()],
        announcements: [],
        focus: stay,
        knownTrigger: true,
      }),
    ).toBe(true);
  });

  it('does not flag the correct pattern (summary announced or focus moved to the field)', () => {
    expect(
      detectErrorNotAnnounced({
        errors: [err()],
        announcements: [
          { politeness: 'assertive', text: 'There is 1 error', selector: '#summary' },
        ],
        focus: stay,
        knownTrigger: true,
      }),
    ).toBe(false);
    expect(
      detectErrorNotAnnounced({
        errors: [err()],
        announcements: [],
        focus: { before: '#signup > button', after: '#email', kind: 'field' },
        knownTrigger: true,
      }),
    ).toBe(false);
  });

  it('needs errors to report anything', () => {
    expect(
      detectErrorNotAnnounced({ errors: [], announcements: [], focus: stay, knownTrigger: true }),
    ).toBe(false);
  });
});
