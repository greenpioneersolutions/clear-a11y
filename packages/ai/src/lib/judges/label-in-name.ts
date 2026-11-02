import { ensureToolkit } from './page-toolkit.js';
import { isDefaultState, quote, type Judge } from './types.js';

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/**
 * Cases code can't settle for 2.5.3, so they go to the model:
 * - the visible label is only symbols ("×", "+", "→", "?"): does the name match what people say?
 * - the name and the visible label share some words but the label isn't contained in the name
 *   (abbreviations, reordering, digits).
 * Clear cases are left alone: names that contain the visible label (pass) and names with no word
 * in common with it (engine-at's at/label-in-name reports those deterministically).
 */
export function isAmbiguousLabelInName(visible: string, name: string): boolean {
  const v = visible.replace(/\s+/g, ' ').trim();
  const n = name.replace(/\s+/g, ' ').trim();
  if (!v || !n) return false;
  const vw = words(v);
  const nw = words(n);
  if (vw.length === 0) return true; // symbol-only visible label
  if (` ${nw.join(' ')} `.includes(` ${vw.join(' ')} `)) return false;
  const shared = vw.filter((w) => nw.includes(w)).length;
  return shared > 0;
}

interface RawControl {
  selector: string;
  role: string;
  visible: string;
  name: string;
  source: 'aria-label' | 'aria-labelledby';
  html: string;
}

export const labelInNameJudge: Judge = {
  id: 'label-in-name',
  wcag: ['2.5.3'],
  title: 'Accessible name may not match the visible label',
  promptVersion: 1,
  fix: 'Start the accessible name with the exact visible label text (or remove aria-label so the visible text is the name).',
  runsIn: isDefaultState,
  async select(ctx, { limit }) {
    await ensureToolkit(ctx.page);
    const raw = await ctx.page.evaluate((): RawControl[] => {
      const h = window.__clearA11y!;
      const t = window.__clearA11yAi!;
      const sel =
        'button, a[href], input[type=submit], input[type=button], input[type=reset], [role=button], [role=link], [role=menuitem], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=option]';
      return Array.from(document.querySelectorAll(sel))
        .filter((el) => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby'))
        .filter((el) => h.isVisible(el) && !t.hidden(el))
        .slice(0, 200)
        .map((el) => {
          const visible =
            el instanceof HTMLInputElement ? el.value : ((el as HTMLElement).innerText ?? '');
          return {
            selector: h.selector(el),
            role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
            visible: t.clean(visible, 120),
            name: t.name(el),
            source: el.hasAttribute('aria-labelledby') ? 'aria-labelledby' : 'aria-label',
            html: h.snippet(el),
          };
        });
    });
    return raw
      .filter((r) => isAmbiguousLabelInName(r.visible, r.name))
      .slice(0, limit)
      .map((r) => ({
        selector: r.selector,
        role: r.role,
        name: r.name,
        html: r.html,
        input: {
          role: r.role,
          visibleLabel: r.visible,
          accessibleName: r.name,
          nameSource: r.source,
        },
      }));
  },
  subject: () => 'This control',
  failMessage: (c, v) =>
    `The control shows ${quote(c.input['visibleLabel'])} but its accessible name is ${quote(c.input['accessibleName'])}: ${v.reason} Speech-input users who say what they see may not be able to activate it.`,
  question: (c) =>
    `Could a speech-input user activate this control by saying its visible label ${quote(c.input['visibleLabel'])}, given its accessible name ${quote(c.input['accessibleName'])}?`,
};
