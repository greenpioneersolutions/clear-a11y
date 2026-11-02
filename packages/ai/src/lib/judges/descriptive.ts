import { ensureToolkit } from './page-toolkit.js';
import { isDefaultState, quote, type Judge } from './types.js';

/** Words that describe nothing when they are the whole heading or label. */
const VAGUE = new Set([
  'section',
  'title',
  'heading',
  'header',
  'untitled',
  'label',
  'field',
  'input',
  'text',
  'info',
  'information',
  'details',
  'misc',
  'miscellaneous',
  'other',
  'stuff',
  'more',
  'content',
  'item',
  'value',
  'data',
  'name',
  'click',
  'here',
  'new',
  'test',
  'lorem ipsum',
]);

export interface RawHeadingOrLabel {
  selector: string;
  kind: 'heading' | 'label' | 'legend';
  text: string;
  level?: number;
  /** Headings: text that follows. Labels: the control type. */
  following: string;
  controlType?: string;
  html: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Suspicion score: vague words, one-word or numeric text, duplicates on the page. */
export function descriptiveScore(
  item: RawHeadingOrLabel,
  all: readonly RawHeadingOrLabel[],
): number {
  const n = norm(item.text);
  if (!n) return 0;
  const wordCount = n.split(' ').length;
  const dupes = all.filter((o) => o !== item && o.kind === item.kind && norm(o.text) === n).length;
  return (
    (VAGUE.has(n) ? 4 : 0) +
    (/^\d+$/.test(n) ? 3 : 0) +
    (dupes > 0 ? 3 : 0) +
    (wordCount === 1 ? 1 : 0) +
    (n.length <= 3 ? 1 : 0)
  );
}

/** Most suspicious first; ties keep document order. Items with no signal are not sent. */
export function pickDescriptiveCandidates(items: readonly RawHeadingOrLabel[], limit: number) {
  return items
    .map((item, i) => ({ item, i, score: descriptiveScore(item, items) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}

export const descriptiveJudge: Judge = {
  id: 'descriptive-headings-labels',
  wcag: ['2.4.6'],
  title: 'Heading or label does not describe its topic or purpose',
  promptVersion: 1,
  fix: 'Rewrite the heading or label so it says what the section is about or what to enter ("Delivery address", not "Section 2" or "Info").',
  runsIn: isDefaultState,
  async select(ctx, { limit }) {
    await ensureToolkit(ctx.page);
    const items = await ctx.page.evaluate((): RawHeadingOrLabel[] => {
      const h = window.__clearA11y!;
      const t = window.__clearA11yAi!;
      const followingText = (el: Element): string => {
        let out = '';
        for (let n = el.nextElementSibling; n && out.length < 200; n = n.nextElementSibling) {
          if (n.matches('h1, h2, h3, h4, h5, h6, [role=heading]')) break;
          out += ` ${(n as HTMLElement).innerText ?? ''}`;
        }
        return t.clean(out, 200);
      };
      const visible = (el: Element) => h.isVisible(el) && !t.hidden(el);
      const headings = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]'),
      )
        .filter(visible)
        .map((el) => ({
          selector: h.selector(el),
          kind: 'heading' as const,
          text: t.clean((el as HTMLElement).innerText, 120),
          level: Number(el.getAttribute('aria-level') ?? el.tagName.slice(1)) || 2,
          following: followingText(el),
          html: h.snippet(el),
        }));
      const labels = Array.from(document.querySelectorAll('label, legend'))
        .filter(visible)
        .map((el) => {
          const control =
            el instanceof HTMLLabelElement
              ? el.control
              : el.closest('fieldset')?.querySelector('input, select, textarea');
          return {
            selector: h.selector(el),
            kind: el.matches('legend') ? ('legend' as const) : ('label' as const),
            text: t.clean((el as HTMLElement).innerText, 120),
            following: '',
            controlType: control
              ? (control.getAttribute('type') ?? control.tagName.toLowerCase())
              : '',
            html: h.snippet(el),
          };
        });
      return [...headings, ...labels].slice(0, 300);
    });
    const pageTitle = items.length ? await ctx.page.title().catch(() => '') : '';
    return pickDescriptiveCandidates(items, limit).map((item) => ({
      selector: item.selector,
      role: item.kind === 'heading' ? 'heading' : item.kind,
      name: item.text,
      html: item.html,
      input: {
        kind: item.kind,
        text: item.text,
        ...(item.level !== undefined ? { level: item.level } : {}),
        ...(item.kind === 'heading' ? { followingContent: item.following } : {}),
        ...(item.controlType ? { controlType: item.controlType } : {}),
        otherSameKindTexts: items
          .filter((o) => o !== item && o.kind === item.kind)
          .slice(0, 12)
          .map((o) => o.text),
        pageTitle,
      },
    }));
  },
  subject: (c) => (c.input['kind'] === 'heading' ? 'This heading' : 'This label'),
  failMessage: (c, v) =>
    `The ${c.input['kind']} ${quote(c.input['text'])} does not describe its ${c.input['kind'] === 'heading' ? 'section' : 'field'}: ${v.reason} People who navigate by headings or labels can't tell the parts of the page apart.`,
  question: (c) =>
    `Does the ${c.input['kind']} ${quote(c.input['text'])} describe the topic or purpose of its ${c.input['kind'] === 'heading' ? 'section' : 'field'}?`,
};
