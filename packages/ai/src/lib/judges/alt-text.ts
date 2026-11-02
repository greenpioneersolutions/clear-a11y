import type { PageContext } from '@clear-a11y/browser';
import type { CompletionImage } from '../providers/types.js';
import { ensureToolkit } from './page-toolkit.js';
import { isDefaultState, quote, type Candidate, type Judge } from './types.js';

/** Last path segment of an image URL, without query or hash. Data URIs give "". */
export function fileNameOf(src: string): string {
  if (!src || src.startsWith('data:')) return '';
  const path = src.split(/[?#]/)[0] ?? '';
  const last = path.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(last).slice(0, 80);
  } catch {
    return last.slice(0, 80);
  }
}

interface RawImage {
  selector: string;
  kind: 'img' | 'input-image' | 'role-img';
  alt: string;
  src: string;
  width: number;
  height: number;
  inLink: string;
  caption: string;
  context: string;
  heading: string;
  html: string;
}

/** Largest crop sent to a model, in CSS px per side. Bigger images are judged from text only. */
const MAX_CROP = 1600;

async function crop(ctx: PageContext, selector: string): Promise<CompletionImage | undefined> {
  try {
    const data = await ctx.page
      .locator(selector)
      .first()
      .screenshot({ type: 'png', timeout: 1_000, animations: 'disabled' });
    if (data.byteLength > 3_000_000) return undefined;
    return { mediaType: 'image/png', data: Buffer.from(data).toString('base64') };
  } catch (err) {
    ctx.log.debug('ai alt-text: crop failed', { selector, error: String(err) });
    return undefined;
  }
}

export const altTextJudge: Judge = {
  id: 'alt-text',
  wcag: ['1.1.1'],
  title: 'Alt text does not convey the image',
  promptVersion: 1,
  fix: 'Write alt text that says what the image shows or does in this context. Use alt="" for purely decorative images.',
  runsIn: isDefaultState,
  async select(ctx, { limit, images }) {
    await ensureToolkit(ctx.page);
    const raw = await ctx.page.evaluate((max: number): RawImage[] => {
      const h = window.__clearA11y!;
      const t = window.__clearA11yAi!;
      const els = Array.from(
        document.querySelectorAll(
          'img[alt]:not([alt=""]), input[type=image][alt]:not([alt=""]), [role=img][aria-label]',
        ),
      ).filter((el) => h.isVisible(el) && !t.hidden(el));
      return els.slice(0, max).map((el) => {
        const link = el.closest('a[href], button, [role=link], [role=button]');
        const figure = el.closest('figure');
        const alt = el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? '';
        const r = el.getBoundingClientRect();
        const block = t.block(el);
        return {
          selector: h.selector(el),
          kind: el.matches('img') ? 'img' : el.matches('input') ? 'input-image' : 'role-img',
          alt: t.clean(alt, 300),
          src: el.getAttribute('src') ?? '',
          width: Math.round(r.width),
          height: Math.round(r.height),
          inLink: link ? t.clean(t.text(link).replace(alt, ''), 120) : '',
          caption: figure ? t.clean(figure.querySelector('figcaption')?.textContent, 200) : '',
          context: block,
          heading: t.headingBefore(el),
          html: h.snippet(el),
        };
      });
    }, limit);
    const pageTitle = raw.length ? await ctx.page.title().catch(() => '') : '';
    const out: Candidate[] = [];
    for (const r of raw) {
      const small = r.width > 0 && r.height > 0 && r.width <= MAX_CROP && r.height <= MAX_CROP;
      const image = images && small ? await crop(ctx, r.selector) : undefined;
      out.push({
        selector: r.selector,
        role: r.kind === 'input-image' ? 'button' : 'img',
        name: r.alt,
        html: r.html,
        input: {
          element: r.kind,
          alt: r.alt,
          fileName: fileNameOf(r.src),
          width: r.width,
          height: r.height,
          inLink: r.inLink,
          caption: r.caption,
          context: r.context,
          heading: r.heading,
          pageTitle,
          screenshotAttached: Boolean(image),
        },
        ...(image ? { image } : {}),
      });
    }
    return out;
  },
  subject: () => 'This image',
  failMessage: (c, v) =>
    `The alt text ${quote(c.input['alt'])} does not convey what this image shows or does: ${v.reason} Screen reader users get this text instead of the image.`,
  question: (c) =>
    `Does the alt text ${quote(c.input['alt'])} tell a screen reader user what this image shows or does here?`,
};
