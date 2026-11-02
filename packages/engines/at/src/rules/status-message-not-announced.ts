import type { RuleMeta } from '@clear-a11y/core';
import { reduceAnnouncements, silentMessages } from '../lib/announcements.js';
import type { ChangedElement, ProbeReport } from '../lib/recorder.js';

export const statusMessageNotAnnouncedRule: RuleMeta = {
  id: 'at/status-message-not-announced',
  engine: 'engine-at',
  wcag: ['4.1.3'],
  tier: 'likely',
  title: 'Status message not announced',
  description:
    'After pressing a button, a short message appears on screen ("Added to cart", "Saved") but it is not in a live region and focus does not move to it. Screen reader users get no feedback and may press the button again or assume it failed.',
  fix: 'Put an empty container with role="status" (or aria-live="polite") in the page when it loads, then write the message into it. Use role="alert" only for urgent messages.',
};

export interface StatusMessageInput {
  report: Pick<ProbeReport, 'announcements' | 'changedText' | 'shown' | 'nativeSubmit'>;
  /**
   * The button is a disclosure (a second press undid the first) or declares its own state
   * (aria-expanded, aria-controls): content it reveals is not a status message.
   */
  revealsSection: boolean;
}

/**
 * Pure analysis for at/status-message-not-announced: returns the silent messages (visible,
 * short, no controls, outside live regions, not focused) when nothing at all was announced.
 */
export function detectStatusMessageNotAnnounced(input: StatusMessageInput): ChangedElement[] {
  const { report } = input;
  if (report.nativeSubmit) return [];
  if (reduceAnnouncements(report.announcements).length > 0) return [];
  const candidates = silentMessages({
    changedText: report.changedText,
    shown: input.revealsSection ? [] : report.shown,
  });
  return candidates.filter((c) => !c.hasFocus);
}
