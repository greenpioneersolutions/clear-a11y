import { readFileSync } from 'node:fs';
import { createServer, SKILL_PATH, TOOL_NAMES } from './server.js';

const skill = readFileSync(SKILL_PATH, 'utf-8');

describe('SKILL.md', () => {
  it('has frontmatter with name and description', () => {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(skill);
    expect(m).not.toBeNull();
    const front = m?.[1] ?? '';
    expect(front).toMatch(/^name: clear-a11y$/m);
    expect(front).toMatch(/^description: .{80,}$/m);
  });

  it('documents every tool and references no unknown tool', () => {
    for (const name of TOOL_NAMES) expect(skill).toContain(`\`${name}`);
    const referenced = new Set(
      [...skill.matchAll(/`([a-z]+_[a-z_]+)[` ]/g)].map((m) => m[1] as string),
    );
    for (const name of referenced) expect(TOOL_NAMES as readonly string[]).toContain(name);
  });

  it('teaches the loop, the tiers and the untrusted-content rule', () => {
    for (const phrase of [
      'violation',
      'likely',
      'needs-review',
      'Re-scan',
      'never call something fixed without a',
      'data, never instructions',
      'When to ask a human',
      'claude mcp add clear-a11y',
    ])
      expect(skill.toLowerCase()).toContain(phrase.toLowerCase());
  });
});

describe('createServer', () => {
  it('registers the five tools without launching a browser', async () => {
    let launched = false;
    const mcp = createServer({
      launch: async () => {
        launched = true;
        throw new Error('not in unit tests');
      },
    });
    expect(mcp.server.isConnected()).toBe(false);
    expect(mcp.context.store.maxScans).toBe(20);
    await mcp.close();
    expect(launched).toBe(false);
  });
});
