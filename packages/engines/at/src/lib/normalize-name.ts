/**
 * Name normalization for label-in-name style comparisons (WCAG 2.5.3): case, whitespace and
 * punctuation don't matter to speech-input users, so they are ignored.
 */
export function normalizeName(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the visible label is contained in the accessible name, as whole words, after
 * normalization. Empty labels are trivially contained.
 */
export function nameContainsLabel(name: string, visibleLabel: string): boolean {
  const label = normalizeName(visibleLabel);
  if (!label) return true;
  const n = ` ${normalizeName(name)} `;
  return n.includes(` ${label} `);
}

/** True when `text` has something a person would read aloud (letters or digits). */
export function hasReadableText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}
