import { ensureToolkit } from './page-toolkit.js';
import { isDefaultState, quote, type Judge } from './types.js';

/** Parses `rgb(r, g, b)` / `rgba(r, g, b, a)` (the computed-style format). */
export function parseRgb(color: string): [number, number, number] | undefined {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(color);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio between two computed colors, rounded to 2 decimals. */
export function contrastRatio(a: string, b: string): number | undefined {
  const ra = parseRgb(a);
  const rb = parseRgb(b);
  if (!ra || !rb) return undefined;
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export interface RawColorItem {
  selector: string;
  kind: 'inline-link' | 'required-label' | 'status-indicator';
  text: string;
  color: string;
  /** Inline links: surrounding text color. Labels: the most common label color. */
  compareColor: string;
  background?: string;
  /** Non-color cues found: underline, border, bold, icon, asterisk... */
  cues: string[];
  context: string;
  accessibleName?: string;
  html: string;
}

/** Keeps items with no non-color cue. Inline links also need a visible color difference. */
export function pickColorOnlyCandidates(items: readonly RawColorItem[], limit: number) {
  return items
    .filter((i) => i.cues.length === 0)
    .filter((i) => i.kind !== 'inline-link' || i.color !== i.compareColor)
    .filter((i) => i.kind !== 'required-label' || i.color !== i.compareColor)
    .slice(0, limit);
}

export const colorOnlyJudge: Judge = {
  id: 'color-only',
  wcag: ['1.4.1'],
  title: 'Meaning may be conveyed by color alone',
  promptVersion: 1,
  fix: 'Add a cue that does not depend on color: underline links in text, add "(required)" or an asterisk explained in the form, put a text label or icon on status indicators.',
  runsIn: isDefaultState,
  async select(ctx, { limit }) {
    await ensureToolkit(ctx.page);
    const items = await ctx.page.evaluate((): RawColorItem[] => {
      const h = window.__clearA11y!;
      const t = window.__clearA11yAi!;
      const visible = (el: Element) => h.isVisible(el) && !t.hidden(el);
      const out: RawColorItem[] = [];
      // Inline links inside running text.
      for (const a of Array.from(
        document.querySelectorAll('p a[href], li a[href], td a[href], dd a[href]'),
      )) {
        if (!visible(a) || out.length > 200) continue;
        const block = a.closest('p, li, td, dd') as HTMLElement;
        const linkText = (a as HTMLElement).innerText.trim();
        const other = block.innerText.replace(linkText, '').trim();
        if (other.length < 20) continue; // not "in text": a nav item or a list of links
        const s = getComputedStyle(a);
        const p = getComputedStyle(block);
        const cues: string[] = [];
        if (s.textDecorationLine.includes('underline')) cues.push('underline');
        if (parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none')
          cues.push('border');
        if (Number(s.fontWeight) - Number(p.fontWeight) >= 300) cues.push('bold');
        if (s.fontStyle !== p.fontStyle) cues.push('italic');
        if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== p.backgroundColor)
          cues.push('background');
        if (a.querySelector('img, svg')) cues.push('icon');
        out.push({
          selector: h.selector(a),
          kind: 'inline-link',
          text: t.clean(linkText, 80),
          color: s.color,
          compareColor: p.color,
          cues,
          context: t.clean(block.innerText, 200),
          html: h.snippet(a),
        });
      }
      // Labels of required fields marked only by color.
      const labels = Array.from(document.querySelectorAll('label')).filter(
        visible,
      ) as HTMLLabelElement[];
      const counts = new Map<string, number>();
      for (const l of labels)
        counts.set(getComputedStyle(l).color, (counts.get(getComputedStyle(l).color) ?? 0) + 1);
      const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      for (const l of labels) {
        const control = l.control;
        if (!control) continue;
        const required =
          control.hasAttribute('required') || control.getAttribute('aria-required') === 'true';
        const text = l.innerText;
        const cues: string[] = [];
        if (/\*|required|mandatory|optional/i.test(text)) cues.push('text');
        if (l.querySelector('img, svg, abbr')) cues.push('icon');
        const color = getComputedStyle(l).color;
        if (!required && color === common) continue;
        out.push({
          selector: h.selector(l),
          kind: 'required-label',
          text: t.clean(text, 80),
          color,
          compareColor: common,
          cues,
          context: required ? 'field is required' : 'field is optional',
          html: h.snippet(l),
        });
      }
      // Status dots, chips and badges with no text.
      for (const el of Array.from(
        document.querySelectorAll(
          '[class*=status i], [class*=badge i], [class*=chip i], [class*=pill i], [class*=indicator i], [class*=dot i]',
        ),
      )) {
        if (!visible(el) || out.length > 260) continue;
        const text = ((el as HTMLElement).innerText ?? '').trim();
        if (text.length > 1) continue;
        const s = getComputedStyle(el);
        if (s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderColor === s.color) continue;
        const name = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
        const cues: string[] = [];
        if (name.trim()) cues.push('accessible name');
        if (el.querySelector('img, svg')) cues.push('icon');
        const parent = el.parentElement;
        out.push({
          selector: h.selector(el),
          kind: 'status-indicator',
          text,
          color: s.color,
          compareColor: parent ? getComputedStyle(parent).color : s.color,
          background: s.backgroundColor,
          cues,
          context: parent ? t.clean(parent.innerText, 160) : '',
          accessibleName: t.clean(name, 80),
          html: h.snippet(el),
        });
      }
      return out;
    });
    return pickColorOnlyCandidates(items, limit).map((i) => ({
      selector: i.selector,
      name: i.text,
      html: i.html,
      input: {
        kind: i.kind,
        text: i.text,
        color: i.color,
        comparedWith: i.compareColor,
        contrastWithComparedColor: contrastRatio(i.color, i.compareColor) ?? null,
        ...(i.background ? { background: i.background } : {}),
        nonColorCues: i.cues,
        context: i.context,
      },
    }));
  },
  subject: (c) =>
    c.input['kind'] === 'inline-link'
      ? 'This link'
      : c.input['kind'] === 'required-label'
        ? 'This label'
        : 'This status indicator',
  failMessage: (c, v) =>
    `${c.input['kind'] === 'inline-link' ? `The link ${quote(c.input['text'])} is told apart from the surrounding text` : c.input['kind'] === 'required-label' ? `The label ${quote(c.input['text'])} marks its field` : 'This indicator conveys its status'} by color alone: ${v.reason} People who can't see the color difference miss the information.`,
  question: (c) =>
    c.input['kind'] === 'inline-link'
      ? `Can someone who can't perceive color tell the link ${quote(c.input['text'])} apart from the text around it?`
      : c.input['kind'] === 'required-label'
        ? `Is the meaning of the label ${quote(c.input['text'])} (for example "required") available without seeing its color?`
        : 'Is the meaning of this status indicator available without seeing its color?',
};
