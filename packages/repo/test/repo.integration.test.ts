import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFinding, ScanResultSchema, type Finding } from '@clear-a11y/core';
import { fixturesReposDir } from '@clear-a11y/test-utils';
import { mapFindingsToSource, scanRepo } from '../src/index.js';

interface Expected {
  correctFiles: string[];
  issues: Array<{ id: string; file: string; line: number; rule: string; wcag: string[] }>;
}

const repoDir = (name: string) => join(fixturesReposDir(), name);
const expectedOf = async (name: string): Promise<Expected> =>
  JSON.parse(await readFile(join(repoDir(name), 'expected.json'), 'utf-8')) as Expected;

const matches = (f: Finding, issue: Expected['issues'][number]) =>
  f.source?.file === issue.file &&
  Math.abs(f.source.line - issue.line) <= 2 &&
  f.wcag.some((sc) => issue.wcag.includes(sc));

describe.each(['react-sample', 'vue-sample'])('scanRepo(%s)', (name) => {
  it('reports every seeded issue at its file and line, and nothing in correct files', async () => {
    const { result, notices } = await scanRepo({ path: repoDir(name), toolVersion: '0.0.0-test' });
    expect(() => ScanResultSchema.parse(result)).not.toThrow();
    expect(result.targets).toEqual([`repo:${repoDir(name)}`]);
    expect(notices).toEqual([]);
    expect(result.errors).toEqual([]);
    const expected = await expectedOf(name);
    for (const issue of expected.issues) {
      const hit = result.findings.find((f) => matches(f, issue));
      expect(hit, `${issue.id} not found`).toBeDefined();
      expect(
        result.findings.some((f) => f.ruleId === `repo/${issue.rule}` && matches(f, issue)),
      ).toBe(true);
    }
    for (const file of expected.correctFiles)
      expect(
        result.findings.filter((f) => f.source?.file === file),
        `findings in correct-pattern file ${file}`,
      ).toEqual([]);
    // Every violation matches an expected issue (precision of violation = 1 on the fixture).
    for (const f of result.findings.filter((x) => x.tier === 'violation'))
      expect(
        expected.issues.some((i) => matches(f, i)),
        `${f.ruleId} ${f.source?.file}`,
      ).toBe(true);
    for (const f of result.findings) {
      expect(f.page).toEqual({ url: `repo:${f.source?.file}`, state: 'source', viewport: 'none' });
      expect(f.engine).toBe('repo-eslint');
    }
  });
});

describe('repo safety', () => {
  it("never loads the scanned repo's eslint.config.js (it throws when executed)", async () => {
    const g = globalThis as { __clearA11yLoadedRepoEslintConfig?: boolean };
    delete g.__clearA11yLoadedRepoEslintConfig;
    const { result } = await scanRepo({
      path: repoDir('react-sample'),
      // Even when the root (which holds eslint.config.js) is the source folder.
      repo: { include: ['.'] },
    });
    expect(g.__clearA11yLoadedRepoEslintConfig).toBeUndefined();
    expect(result.findings.length).toBeGreaterThan(0);
    // The config file itself is only read as text and linted: no findings, no execution.
    expect(result.findings.some((f) => f.source?.file === 'eslint.config.js')).toBe(false);
  });

  it('rejects include paths that leave the repo', async () => {
    await expect(
      scanRepo({ path: repoDir('react-sample'), repo: { include: ['../vue-sample'] } }),
    ).rejects.toThrow(/inside the repo/);
  });
});

describe('mapFindingsToSource on the React sample', () => {
  const runtime = (selector: string, html?: string): Finding =>
    createFinding({
      ruleId: 'static/label',
      wcag: ['1.3.1'],
      tier: 'violation',
      confidence: 1,
      engine: 'engine-static',
      page: { url: 'http://localhost:5173/' },
      target: { selector },
      evidence: html ? { html } : {},
      message: 'Form field has no label.',
    });

  it('maps unique ids and test ids, and leaves ambiguous ones without a source', async () => {
    const [email, actions, closeLink, attr] = await mapFindingsToSource(
      [
        runtime('#signup-email'),
        runtime('nav', '<nav aria-label="Dialog actions" data-testid="dialog-actions">'),
        runtime('a.icon-button', '<a class="icon-button">Close</a>'),
        runtime('img', '<img data-source-file="src/components/Banner.tsx" data-source-line="7">'),
      ],
      repoDir('react-sample'),
    );
    expect(email?.source).toEqual({ file: 'src/components/SignupForm.tsx', line: 6 });
    expect(actions?.source).toEqual({ file: 'src/App.tsx', line: 14 });
    // "icon-button" is used in four places: a candidate list, never a guessed location.
    expect(closeLink?.source).toBeUndefined();
    expect(attr?.source).toEqual({ file: 'src/components/Banner.tsx', line: 7 });
  });
});
