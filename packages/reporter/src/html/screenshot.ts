import { readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Largest single screenshot we inline (bytes). Crops are small; anything bigger is skipped. */
export const MAX_SCREENSHOT_BYTES = 1_500_000;

/**
 * Resolves `evidence.screenshot` to a data URI, or undefined when it cannot or must not be inlined:
 * `memory:` artifacts, missing files, non-image files, paths that escape `baseDir`, oversized files.
 * Existing data URIs pass through only when they are well-formed base64 PNG, JPEG or WebP.
 */
export function screenshotDataUri(path: string, baseDir: string | undefined): string | undefined {
  if (path.startsWith('data:')) return DATA_URI.test(path) ? path : undefined;
  if (
    !baseDir ||
    path.startsWith('memory:') ||
    isAbsolute(path) ||
    /^[a-z][a-z0-9+.-]*:/i.test(path)
  )
    return undefined;
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) return undefined;
  const root = resolve(baseDir);
  const file = resolve(root, path);
  if (!file.startsWith(root + sep)) return undefined;
  try {
    if (statSync(file).size > MAX_SCREENSHOT_BYTES) return undefined;
    return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  } catch {
    return undefined;
  }
}
