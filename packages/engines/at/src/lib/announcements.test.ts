import {
  focusMoved,
  formatAnnouncements,
  isReadableText,
  reduceAnnouncements,
  silentMessages,
} from './announcements.js';
import type { ChangedElement } from './recorder.js';

const el = (over: Partial<ChangedElement> = {}): ChangedElement => ({
  selector: '#msg',
  text: 'Saved',
  isPopup: false,
  hasFocusable: false,
  insideTrigger: false,
  inLiveRegion: false,
  hasFocus: false,
  ...over,
});

describe('announcement queue', () => {
  it('drops empty entries and consecutive duplicates', () => {
    const queue = reduceAnnouncements([
      { politeness: 'polite', text: 'Saved', selector: '#s' },
      { politeness: 'polite', text: ' Saved ', selector: '#s' },
      { politeness: 'polite', text: '', selector: '#s' },
      { politeness: 'assertive', text: 'Email is required', selector: '#a' },
    ]);
    expect(queue.map((a) => a.text)).toEqual(['Saved', 'Email is required']);
  });

  it('formats evidence text', () => {
    expect(formatAnnouncements([])).toBe('nothing announced');
    expect(
      formatAnnouncements([{ politeness: 'assertive', text: 'Email is required', selector: '#a' }]),
    ).toBe('assertive: "Email is required"');
  });
});

describe('isReadableText', () => {
  it('needs a letter or a digit', () => {
    expect(isReadableText('Saved')).toBe(true);
    expect(isReadableText('3 items')).toBe(true);
    expect(isReadableText('Gespeichert ✓')).toBe(true);
    expect(isReadableText('…')).toBe(false);
    expect(isReadableText('• — ·')).toBe(false);
  });
});

describe('silentMessages', () => {
  it('ignores text that is not human-readable', () => {
    expect(silentMessages({ changedText: [el({ text: '—' })], shown: [] })).toEqual([]);
  });

  it('keeps short text outside live regions and drops new UI', () => {
    const out = silentMessages({
      changedText: [
        el(),
        el({ selector: '#live', inLiveRegion: true }),
        el({ selector: '#dialog', isPopup: true }),
        el({ selector: '#form', hasFocusable: true }),
        el({ selector: '#label', insideTrigger: true }),
        el({ selector: '#long', text: 'x'.repeat(201) }),
      ],
      shown: [el()],
    });
    expect(out.map((m) => m.selector)).toEqual(['#msg']);
  });
});

describe('focusMoved', () => {
  it('counts a move to a field or message, not staying on the trigger or body', () => {
    expect(focusMoved({ before: '#b', after: '#b', kind: 'trigger' }, true)).toBe(false);
    expect(focusMoved({ before: '#b', after: 'body', kind: 'body' }, true)).toBe(false);
    expect(focusMoved({ before: '#b', after: '#email', kind: 'field' }, true)).toBe(true);
    expect(focusMoved({ before: 'body', after: '#summary', kind: 'other' }, false)).toBe(true);
  });

  it('does not count landing on a button when the trigger is unknown (a replayed state)', () => {
    expect(focusMoved({ before: 'body', after: '#submit', kind: 'control' }, false)).toBe(false);
  });
});
