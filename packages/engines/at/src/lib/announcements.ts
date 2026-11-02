import type { Announcement, ChangedElement, FocusInfo, ProbeReport } from './recorder.js';

/**
 * Pure reducer over the recorded announcement queue: drops consecutive duplicates (a region
 * updated twice with the same text is spoken once) and empty entries.
 */
export function reduceAnnouncements(queue: readonly Announcement[]): Announcement[] {
  const out: Announcement[] = [];
  for (const a of queue) {
    const text = a.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.text === text && prev.politeness === a.politeness) continue;
    out.push({ ...a, text });
  }
  return out;
}

/** Evidence text for `evidence.announcement`, e.g. `assertive: "Email is required"`. */
export function formatAnnouncements(queue: readonly Announcement[]): string {
  const reduced = reduceAnnouncements(queue);
  if (reduced.length === 0) return 'nothing announced';
  return reduced.map((a) => `${a.politeness}: "${a.text}"`).join('\n');
}

/** Human-readable: at least one letter or digit (not just punctuation, symbols or spaces). */
export const isReadableText = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

/**
 * Candidate messages: visible, human-readable text that appeared outside live regions and is not
 * new UI (dialogs, menus, blocks with controls) or the activated control's own label.
 */
export function silentMessages(
  report: Pick<ProbeReport, 'changedText' | 'shown'>,
  maxLength = 200,
): ChangedElement[] {
  const seen = new Set<string>();
  return [...report.changedText, ...report.shown].filter((c) => {
    if (!c.selector || seen.has(c.selector)) return false;
    seen.add(c.selector);
    return (
      !c.inLiveRegion &&
      !c.isPopup &&
      !c.hasFocusable &&
      !c.insideTrigger &&
      isReadableText(c.text) &&
      c.text.length <= maxLength
    );
  });
}

/**
 * True when focus moved somewhere that tells a screen reader user something changed: away from
 * the activated control (or the page body) to a field, the message itself or another element.
 * Focus landing on another button or link is not counted when we don't know the trigger.
 */
export function focusMoved(focus: FocusInfo, knownTrigger: boolean): boolean {
  if (focus.after === null || focus.after === focus.before) return false;
  if (focus.kind === 'body' || focus.kind === 'trigger') return false;
  if (!knownTrigger && focus.kind === 'control') return false;
  return true;
}
