import type { RuleMeta } from '@clear-a11y/core';

export const altTextSuspiciousRule: RuleMeta = {
  id: 'at/alt-text-suspicious',
  engine: 'engine-at',
  wcag: ['1.1.1'],
  tier: 'likely',
  title: 'Alt text is a file name, URL or placeholder',
  description:
    'An image has alt text, so rules scanners pass it, but the text is a file name ("IMG_2041.jpg"), a URL, or a placeholder word ("image", "photo", "spacer"). Screen reader users hear that text instead of a description and learn nothing about the image.',
  fix: 'Replace the alt text with a short description of what the image shows or does in this context. If the image is decorative, use alt="" so screen readers skip it.',
};

export type AltSuspicion = 'file-name' | 'url' | 'placeholder';

export interface AltTextSuspiciousInput {
  /** The alt (or aria-label) text. */
  alt: string;
  /** The image's src, to recognise alt text that repeats the file name. */
  src?: string;
}

const IMAGE_FILE = /^[^\s/\\]+\.(jpe?g|png|gif|webp|svg|bmp|tiff?|avif|heic|ico)$/i;
const CAMERA_NAME =
  /^(img|dsc|dscn|dscf|pxl|mvimg|screenshot|screen shot|photo|image)[\s_-]?\d{3,}$/i;
const URL_LIKE = /^(https?:\/\/|www\.)\S+$/i;
const PLACEHOLDER =
  /^(image|img|photo|photograph|picture|pic|graphic|spacer|icon|logo|banner|placeholder|untitled|blank|alt|alt text|thumbnail|thumb|null|undefined|none|todo)( ?\d+)?$/;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function fileBase(src: string): string {
  if (!src || src.startsWith('data:')) return '';
  const last = (src.split(/[?#]/)[0] ?? '').split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Why the alt text describes nothing, or undefined when it may be meaningful. */
export function altTextSuspicion(input: AltTextSuspiciousInput): AltSuspicion | undefined {
  const alt = input.alt.replace(/\s+/g, ' ').trim();
  if (!alt) return undefined;
  if (URL_LIKE.test(alt)) return 'url';
  if (IMAGE_FILE.test(alt) || CAMERA_NAME.test(alt)) return 'file-name';
  const base = fileBase(input.src ?? '');
  if (base) {
    const stem = base.replace(/\.[a-z0-9]+$/i, '');
    if (
      alt === base ||
      (stem.length >= 3 && normalize(alt) === normalize(stem) && /[_-]|\d/.test(stem))
    ) {
      return 'file-name';
    }
  }
  if (PLACEHOLDER.test(normalize(alt))) return 'placeholder';
  return undefined;
}

/** Pure analysis for at/alt-text-suspicious: alt text that is a file name, URL or placeholder. */
export function detectAltTextSuspicious(input: AltTextSuspiciousInput): boolean {
  return altTextSuspicion(input) !== undefined;
}
