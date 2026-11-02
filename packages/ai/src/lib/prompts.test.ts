import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JUDGES } from './judges/index.js';
import { loadPrompt, parseFrontmatter, parsePromptFile } from './prompts.js';
import { normalizeInput, recordingKey, stableStringify } from './recording-key.js';

const promptsDir = fileURLToPath(new URL('../../prompts/', import.meta.url));

describe('prompt files', () => {
  it('ships a versioned prompt for every judge with matching frontmatter and WCAG', () => {
    for (const judge of JUDGES) {
      const p = loadPrompt(judge.id, judge.promptVersion);
      expect(p.id).toBe(judge.id);
      expect(p.version).toBe(judge.promptVersion);
      expect(p.wcag).toEqual(judge.wcag);
      expect(p.body.match(/\{\{[^}]*\}\}/g)).toEqual(['{{page_data}}']);
    }
  });

  it('has a system prompt that declares page data untrusted', () => {
    const system = loadPrompt('system', 1).body;
    expect(system).toMatch(/untrusted/);
    expect(system).toMatch(/never instructions/);
    expect(system).not.toMatch(/\{\{/);
  });

  it('names every file <id>.v<version>.md', () => {
    for (const file of readdirSync(promptsDir)) {
      expect(file).toMatch(/^[a-z0-9-]+\.v\d+\.md$/);
      const [id, v] = file.replace(/\.md$/, '').split('.v');
      parsePromptFile(readFileSync(`${promptsDir}${file}`, 'utf-8'), {
        id: id!,
        version: Number(v),
      });
    }
  });

  it('parses frontmatter lists and rejects mismatched versions', () => {
    expect(parseFrontmatter('---\nid: x\nwcag: [1.1.1, 2.4.4]\n---\nbody').data).toEqual({
      id: 'x',
      wcag: ['1.1.1', '2.4.4'],
    });
    expect(() =>
      parsePromptFile('---\nid: x\nversion: 2\n---\nb', { id: 'x', version: 1 }),
    ).toThrow(/declares x v2/);
    expect(() => parseFrontmatter('no frontmatter')).toThrow();
    expect(() => loadPrompt('../etc', 1)).toThrow(/invalid prompt id/);
  });
});

describe('recording keys', () => {
  it('ignore key order, whitespace and undefined values', () => {
    expect(recordingKey('j', { a: ' x  y ', b: 1, c: undefined })).toBe(
      recordingKey('j', { b: 1, a: 'x y' }),
    );
    expect(recordingKey('j', { a: 1 })).not.toBe(recordingKey('k', { a: 1 }));
    expect(stableStringify({ b: [1, { d: 2, c: 1 }], a: null })).toBe(
      '{"a":null,"b":[1,{"c":1,"d":2}]}',
    );
    expect(normalizeInput(['  a ', 2])).toEqual(['a', 2]);
  });
});
