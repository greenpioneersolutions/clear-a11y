export type WcagLevel = 'A' | 'AA' | 'AAA';
export type WcagPrinciple = 'Perceivable' | 'Operable' | 'Understandable' | 'Robust';

export interface SuccessCriterion {
  sc: string;
  title: string;
  level: WcagLevel;
  principle: WcagPrinciple;
  /** WCAG version that introduced it. */
  since: '2.0' | '2.1' | '2.2';
  /** 4.1.1 Parsing is obsolete and removed in WCAG 2.2. */
  removed?: boolean;
  understanding: string;
}

type Row = [
  sc: string,
  title: string,
  level: WcagLevel,
  since: SuccessCriterion['since'],
  removed?: true,
];

const ROWS: Row[] = [
  ['1.1.1', 'Non-text Content', 'A', '2.0'],
  ['1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', '2.0'],
  ['1.2.2', 'Captions (Prerecorded)', 'A', '2.0'],
  ['1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A', '2.0'],
  ['1.2.4', 'Captions (Live)', 'AA', '2.0'],
  ['1.2.5', 'Audio Description (Prerecorded)', 'AA', '2.0'],
  ['1.2.6', 'Sign Language (Prerecorded)', 'AAA', '2.0'],
  ['1.2.7', 'Extended Audio Description (Prerecorded)', 'AAA', '2.0'],
  ['1.2.8', 'Media Alternative (Prerecorded)', 'AAA', '2.0'],
  ['1.2.9', 'Audio-only (Live)', 'AAA', '2.0'],
  ['1.3.1', 'Info and Relationships', 'A', '2.0'],
  ['1.3.2', 'Meaningful Sequence', 'A', '2.0'],
  ['1.3.3', 'Sensory Characteristics', 'A', '2.0'],
  ['1.3.4', 'Orientation', 'AA', '2.1'],
  ['1.3.5', 'Identify Input Purpose', 'AA', '2.1'],
  ['1.3.6', 'Identify Purpose', 'AAA', '2.1'],
  ['1.4.1', 'Use of Color', 'A', '2.0'],
  ['1.4.2', 'Audio Control', 'A', '2.0'],
  ['1.4.3', 'Contrast (Minimum)', 'AA', '2.0'],
  ['1.4.4', 'Resize Text', 'AA', '2.0'],
  ['1.4.5', 'Images of Text', 'AA', '2.0'],
  ['1.4.6', 'Contrast (Enhanced)', 'AAA', '2.0'],
  ['1.4.7', 'Low or No Background Audio', 'AAA', '2.0'],
  ['1.4.8', 'Visual Presentation', 'AAA', '2.0'],
  ['1.4.9', 'Images of Text (No Exception)', 'AAA', '2.0'],
  ['1.4.10', 'Reflow', 'AA', '2.1'],
  ['1.4.11', 'Non-text Contrast', 'AA', '2.1'],
  ['1.4.12', 'Text Spacing', 'AA', '2.1'],
  ['1.4.13', 'Content on Hover or Focus', 'AA', '2.1'],
  ['2.1.1', 'Keyboard', 'A', '2.0'],
  ['2.1.2', 'No Keyboard Trap', 'A', '2.0'],
  ['2.1.3', 'Keyboard (No Exception)', 'AAA', '2.0'],
  ['2.1.4', 'Character Key Shortcuts', 'A', '2.1'],
  ['2.2.1', 'Timing Adjustable', 'A', '2.0'],
  ['2.2.2', 'Pause, Stop, Hide', 'A', '2.0'],
  ['2.2.3', 'No Timing', 'AAA', '2.0'],
  ['2.2.4', 'Interruptions', 'AAA', '2.0'],
  ['2.2.5', 'Re-authenticating', 'AAA', '2.0'],
  ['2.2.6', 'Timeouts', 'AAA', '2.1'],
  ['2.3.1', 'Three Flashes or Below Threshold', 'A', '2.0'],
  ['2.3.2', 'Three Flashes', 'AAA', '2.0'],
  ['2.3.3', 'Animation from Interactions', 'AAA', '2.1'],
  ['2.4.1', 'Bypass Blocks', 'A', '2.0'],
  ['2.4.2', 'Page Titled', 'A', '2.0'],
  ['2.4.3', 'Focus Order', 'A', '2.0'],
  ['2.4.4', 'Link Purpose (In Context)', 'A', '2.0'],
  ['2.4.5', 'Multiple Ways', 'AA', '2.0'],
  ['2.4.6', 'Headings and Labels', 'AA', '2.0'],
  ['2.4.7', 'Focus Visible', 'AA', '2.0'],
  ['2.4.8', 'Location', 'AAA', '2.0'],
  ['2.4.9', 'Link Purpose (Link Only)', 'AAA', '2.0'],
  ['2.4.10', 'Section Headings', 'AAA', '2.0'],
  ['2.4.11', 'Focus Not Obscured (Minimum)', 'AA', '2.2'],
  ['2.4.12', 'Focus Not Obscured (Enhanced)', 'AAA', '2.2'],
  ['2.4.13', 'Focus Appearance', 'AAA', '2.2'],
  ['2.5.1', 'Pointer Gestures', 'A', '2.1'],
  ['2.5.2', 'Pointer Cancellation', 'A', '2.1'],
  ['2.5.3', 'Label in Name', 'A', '2.1'],
  ['2.5.4', 'Motion Actuation', 'A', '2.1'],
  ['2.5.5', 'Target Size (Enhanced)', 'AAA', '2.1'],
  ['2.5.6', 'Concurrent Input Mechanisms', 'AAA', '2.1'],
  ['2.5.7', 'Dragging Movements', 'AA', '2.2'],
  ['2.5.8', 'Target Size (Minimum)', 'AA', '2.2'],
  ['3.1.1', 'Language of Page', 'A', '2.0'],
  ['3.1.2', 'Language of Parts', 'AA', '2.0'],
  ['3.1.3', 'Unusual Words', 'AAA', '2.0'],
  ['3.1.4', 'Abbreviations', 'AAA', '2.0'],
  ['3.1.5', 'Reading Level', 'AAA', '2.0'],
  ['3.1.6', 'Pronunciation', 'AAA', '2.0'],
  ['3.2.1', 'On Focus', 'A', '2.0'],
  ['3.2.2', 'On Input', 'A', '2.0'],
  ['3.2.3', 'Consistent Navigation', 'AA', '2.0'],
  ['3.2.4', 'Consistent Identification', 'AA', '2.0'],
  ['3.2.5', 'Change on Request', 'AAA', '2.0'],
  ['3.2.6', 'Consistent Help', 'A', '2.2'],
  ['3.3.1', 'Error Identification', 'A', '2.0'],
  ['3.3.2', 'Labels or Instructions', 'A', '2.0'],
  ['3.3.3', 'Error Suggestion', 'AA', '2.0'],
  ['3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA', '2.0'],
  ['3.3.5', 'Help', 'AAA', '2.0'],
  ['3.3.6', 'Error Prevention (All)', 'AAA', '2.0'],
  ['3.3.7', 'Redundant Entry', 'A', '2.2'],
  ['3.3.8', 'Accessible Authentication (Minimum)', 'AA', '2.2'],
  ['3.3.9', 'Accessible Authentication (Enhanced)', 'AAA', '2.2'],
  ['4.1.1', 'Parsing', 'A', '2.0', true],
  ['4.1.2', 'Name, Role, Value', 'A', '2.0'],
  ['4.1.3', 'Status Messages', 'AA', '2.1'],
];

const PRINCIPLES: Record<string, WcagPrinciple> = {
  '1': 'Perceivable',
  '2': 'Operable',
  '3': 'Understandable',
  '4': 'Robust',
};

/** W3C "Understanding WCAG 2.2" slug, e.g. "Contrast (Minimum)" -> "contrast-minimum". */
export function understandingSlug(title: string): string {
  return title.toLowerCase().replace(/[(),]/g, '').replace(/\s+/g, '-');
}

export const WCAG: Readonly<Record<string, SuccessCriterion>> = Object.freeze(
  Object.fromEntries(
    ROWS.map(([sc, title, level, since, removed]) => [
      sc,
      {
        sc,
        title,
        level,
        since,
        principle: PRINCIPLES[sc.charAt(0)] as WcagPrinciple,
        ...(removed ? { removed: true } : {}),
        understanding: `https://www.w3.org/WAI/WCAG22/Understanding/${understandingSlug(title)}.html`,
      } satisfies SuccessCriterion,
    ]),
  ),
);

export function getSuccessCriterion(sc: string): SuccessCriterion | undefined {
  return WCAG[sc];
}

/** Success criteria in scope for a conformance target (WCAG 2.2, excluding removed ones). */
export function criteriaForLevel(level: WcagLevel = 'AA'): SuccessCriterion[] {
  const allowed: WcagLevel[] =
    level === 'A' ? ['A'] : level === 'AA' ? ['A', 'AA'] : ['A', 'AA', 'AAA'];
  return Object.values(WCAG).filter((c) => !c.removed && allowed.includes(c.level));
}

/** Converts axe-style tags ("wcag143", "wcag1410") to SC numbers ("1.4.3", "1.4.10"). */
export function scFromAxeTag(tag: string): string | undefined {
  const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
  if (!m) return undefined;
  const sc = `${m[1]}.${m[2]}.${m[3]}`;
  return WCAG[sc] ? sc : undefined;
}

/** Sorts SC numbers numerically ("1.4.10" after "1.4.9"). */
export function compareSc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
