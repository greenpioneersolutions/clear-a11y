import type { ChangedElement, ProbeReport } from '../lib/recorder.js';
import {
  detectStatusMessageNotAnnounced,
  statusMessageNotAnnouncedRule,
} from './status-message-not-announced.js';

const msg = (over: Partial<ChangedElement> = {}): ChangedElement => ({
  selector: '#cart-status',
  text: 'Added to cart. 1 item in your cart.',
  isPopup: false,
  hasFocusable: false,
  insideTrigger: false,
  inLiveRegion: false,
  hasFocus: false,
  ...over,
});

const report = (over: Partial<ProbeReport> = {}) => ({
  announcements: [],
  changedText: [msg()],
  shown: [],
  nativeSubmit: false,
  ...over,
});

describe('at/status-message-not-announced', () => {
  it('has rule metadata', () => {
    expect(statusMessageNotAnnouncedRule.id).toBe('at/status-message-not-announced');
    expect(statusMessageNotAnnouncedRule.wcag).toEqual(['4.1.3']);
  });

  it('detects a message that appears silently', () => {
    expect(
      detectStatusMessageNotAnnounced({ report: report(), revealsSection: false }).map(
        (m) => m.selector,
      ),
    ).toEqual(['#cart-status']);
  });

  it('does not flag the correct pattern (the message was announced)', () => {
    const announced = report({
      announcements: [{ politeness: 'polite', text: 'Added to cart.', selector: '#cart-status' }],
    });
    expect(detectStatusMessageNotAnnounced({ report: announced, revealsSection: false })).toEqual(
      [],
    );
  });

  it('ignores new UI, focused messages and sections revealed by a disclosure', () => {
    const r = report({
      changedText: [msg({ hasFocusable: true }), msg({ selector: '#m2', hasFocus: true })],
      shown: [msg({ selector: '#panel' })],
    });
    expect(detectStatusMessageNotAnnounced({ report: r, revealsSection: true })).toEqual([]);
    expect(
      detectStatusMessageNotAnnounced({ report: r, revealsSection: false }).map((m) => m.selector),
    ).toEqual(['#panel']);
  });
});
