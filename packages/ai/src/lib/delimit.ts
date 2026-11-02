/**
 * Prompt-injection hardening, part 1: page-derived content only ever reaches a model inside a
 * delimited data block.
 *
 * The content is serialized as JSON and every `<`, `>` and `&` is escaped as a JSON unicode
 * escape. The block is still valid JSON with exactly the same value, but page text can't contain
 * a literal tag, so it can never close the block or open a fake one. Strings stay quoted, so
 * page text can't break out of a JSON string either.
 */
export const PAGE_DATA_TAG = 'page_data';

export function escapeForDataBlock(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/** Wraps untrusted data in `<page_data nonce="…">…</page_data>`. */
export function delimitPageData(data: unknown, nonce: string): string {
  if (!/^[A-Za-z0-9]{6,64}$/.test(nonce)) throw new Error('nonce must be 6-64 letters/digits');
  const json = escapeForDataBlock(JSON.stringify(data, null, 2));
  return `<${PAGE_DATA_TAG} nonce="${nonce}">\n${json}\n</${PAGE_DATA_TAG}>`;
}

/** Splits a built prompt into the text outside and inside data blocks (used by tests and checks). */
export function splitDataBlocks(prompt: string): { outside: string; inside: string[] } {
  const inside: string[] = [];
  const outside = prompt.replace(
    new RegExp(`<${PAGE_DATA_TAG} nonce="[A-Za-z0-9]+">([\\s\\S]*?)</${PAGE_DATA_TAG}>`, 'g'),
    (_m, body: string) => {
      inside.push(body);
      return `<${PAGE_DATA_TAG}/>`;
    },
  );
  return { outside, inside };
}

/** Fills the template's single `{{page_data}}` slot. Templates have no other placeholders. */
export function buildPrompt(template: string, data: unknown, nonce: string): string {
  const slots = template.match(/\{\{[^}]*\}\}/g) ?? [];
  if (slots.length !== 1 || slots[0] !== '{{page_data}}') {
    throw new Error('prompt template must contain exactly one {{page_data}} placeholder');
  }
  // A function replacement, so `$&`-style patterns in the data are not interpreted.
  return template.replace('{{page_data}}', () => delimitPageData(data, nonce));
}
