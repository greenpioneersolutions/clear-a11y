import type { RuleMeta } from '@clear-a11y/core';
import type { Problem } from '../lib/types.js';

export const disclosureKeyboardRule: RuleMeta = {
  id: 'widgets/disclosure-keyboard',
  engine: 'engine-widgets',
  wcag: ['2.1.1', '4.1.2'],
  tier: 'violation',
  title: 'Disclosure buttons toggle with Enter and Space and report their state',
  description:
    'Presses Enter, Space and a mouse click on each control with aria-expanded (show/hide buttons, accordion headers) on a fresh page. A disclosure that toggles with the mouse but not with Enter or Space blocks keyboard users (2.1.1). aria-expanded that disagrees with whether the controlled content is shown misinforms screen reader users (4.1.2).',
  fix: 'Use a native <button> for the toggle (it handles Enter and Space), and on every toggle set aria-expanded to "true" or "false" to match whether the region it controls (aria-controls) is shown.',
};

export interface DisclosureState {
  expanded: string | null;
  /** Visibility of the controlled region; null when the region is unknown. */
  regionVisible: boolean | null;
}

export interface DisclosureObservation {
  button: string;
  region: string | null;
  tabbable: boolean;
  initial: DisclosureState;
  /** State after each action on a fresh page. */
  after: Record<'Enter' | 'Space' | 'click', DisclosureState>;
}

const base = { ruleId: disclosureKeyboardRule.id };

const toggled = (initial: DisclosureState, s: DisclosureState) =>
  s.expanded !== initial.expanded ||
  (s.regionVisible !== null && s.regionVisible !== initial.regionVisible);

const mismatched = (s: DisclosureState) =>
  s.regionVisible !== null &&
  ((s.regionVisible && s.expanded === 'false') || (!s.regionVisible && s.expanded === 'true'));

/** Pure APG disclosure check. */
export function evaluateDisclosure(obs: DisclosureObservation): Problem[] {
  const problems: Problem[] = [];
  const enter = toggled(obs.initial, obs.after.Enter);
  const space = toggled(obs.initial, obs.after.Space);
  const click = toggled(obs.initial, obs.after.click);
  if (click && !enter && !space) {
    problems.push({
      ...base,
      wcag: ['2.1.1'],
      tier: 'violation',
      confidence: 0.95,
      selector: obs.button,
      message: obs.tabbable
        ? 'This toggle opens and closes with a mouse click but not with Enter or Space, so keyboard users cannot show the content.'
        : 'This toggle is not in the Tab sequence and works only with a mouse click, so keyboard users cannot show the content.',
    });
  } else if (enter !== space) {
    const missing = enter ? 'Space' : 'Enter';
    problems.push({
      ...base,
      wcag: ['2.1.1'],
      tier: 'needs-review',
      confidence: 0.5,
      selector: obs.button,
      message: `This toggle responds to ${enter ? 'Enter' : 'Space'} but not to ${missing}, unlike a native button and the ARIA Authoring Practices disclosure pattern.`,
      question: `Can keyboard users reliably operate this toggle even though ${missing} does nothing?`,
    });
  }
  const checked: Array<[string, DisclosureState]> = [
    ['at load', obs.initial],
    ...(['Enter', 'Space', 'click'] as const)
      .filter((k) => toggled(obs.initial, obs.after[k]))
      .map((k): [string, DisclosureState] => [
        `after ${k === 'click' ? 'a click' : k}`,
        obs.after[k],
      ]),
  ];
  const bad = checked.find(([, s]) => mismatched(s));
  if (bad) {
    const [when, s] = bad;
    problems.push({
      ...base,
      wcag: ['4.1.2'],
      tier: 'violation',
      confidence: 0.9,
      selector: obs.button,
      message: `${when[0]!.toUpperCase()}${when.slice(1)} the content it controls is ${s.regionVisible ? 'shown' : 'hidden'}, but the toggle reports aria-expanded="${s.expanded}", so screen readers announce the wrong state.`,
      data: { region: obs.region, state: s },
    });
  }
  return problems;
}
