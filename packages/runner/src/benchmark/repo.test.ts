import { createFinding, type Finding, type Tier } from '@clear-a11y/core';
import {
  repoBenchmarkToMarkdown,
  repoFindingMatchesIssue,
  RepoExpectedSchema,
  scoreRepoBenchmark,
  type RepoExpectedIssue,
} from './repo.js';

const finding = (file: string, line: number, wcag: string[], tier: Tier = 'likely'): Finding =>
  createFinding({
    ruleId: 'repo/jsx-a11y/alt-text',
    wcag,
    tier,
    confidence: 0.7,
    engine: 'repo-eslint',
    page: { url: `repo:${file}`, state: 'source', viewport: 'none' },
    target: { selector: `<img> ${line}` },
    source: { file, line },
    message: 'Image has no alt text.',
    ...(tier === 'needs-review' ? { question: 'Is it ok?' } : {}),
  });

const issue = (file: string, line: number, wcag: string[]): RepoExpectedIssue => ({
  id: `${file}:${line}`,
  file,
  line,
  wcag,
  layer: 'repo',
  description: 'x',
});

describe('repo benchmark matching', () => {
  it('matches same file, line within ±2 and overlapping SC', () => {
    const i = issue('src/A.tsx', 10, ['1.1.1']);
    expect(repoFindingMatchesIssue(finding('src/A.tsx', 10, ['1.1.1']), i)).toBe(true);
    expect(repoFindingMatchesIssue(finding('src/A.tsx', 8, ['1.1.1']), i)).toBe(true);
    expect(repoFindingMatchesIssue(finding('src/A.tsx', 12, ['1.1.1', '4.1.2']), i)).toBe(true);
    expect(repoFindingMatchesIssue(finding('src/A.tsx', 13, ['1.1.1']), i)).toBe(false);
    expect(repoFindingMatchesIssue(finding('src/B.tsx', 10, ['1.1.1']), i)).toBe(false);
    expect(repoFindingMatchesIssue(finding('src/A.tsx', 10, ['2.4.3']), i)).toBe(false);
  });

  it('scores recall, violation precision and correct-file noise', () => {
    const expected = RepoExpectedSchema.parse({
      repo: 'sample',
      title: 'Sample',
      correctFiles: ['src/Ok.tsx'],
      issues: [issue('src/A.tsx', 10, ['1.1.1']), issue('src/A.tsx', 30, ['2.4.3'])],
    });
    const r = scoreRepoBenchmark([
      {
        expected,
        files: 2,
        findings: [
          finding('src/A.tsx', 10, ['1.1.1'], 'violation'),
          finding('src/A.tsx', 20, ['3.1.1'], 'violation'),
          finding('src/Ok.tsx', 1, ['1.1.1']),
        ],
      },
    ]);
    expect(r).toMatchObject({
      repos: 1,
      files: 2,
      expectedIssues: 2,
      matchedIssues: 1,
      recall: 0.5,
      violation: { total: 2, truePositive: 1, falsePositive: 1, precision: 0.5 },
      byRepo: { sample: { expected: 2, matched: 1, recall: 0.5 } },
    });
    expect(r.correctFileNoise).toHaveLength(1);
    expect(r.missed.map((m) => m.where)).toEqual(['src/A.tsx:30']);
    const md = repoBenchmarkToMarkdown(r);
    expect(md).toContain('## Repo layer (source scanning)');
    expect(md).toContain('| Recall (any tier) | 50.0% (1/2) |');
    expect(md).toContain('src/Ok.tsx:1');
  });

  const storyFinding = (story: string, selector: string, wcag: string[], tier: Tier): Finding =>
    createFinding({
      ruleId: 'static/button-name',
      wcag,
      tier,
      confidence: 0.9,
      engine: 'engine-static',
      page: { url: `repo:storybook-static/iframe.html?id=${story}&viewMode=story` },
      target: { selector },
      // Mapped to a component file: still judged by its story, not by correctFiles.
      source: { file: 'src/Ok.tsx', line: 3 },
      message: 'Button has no name.',
    });

  it('matches story issues by story id, selector and SC, and counts noise on correct stories', () => {
    const expected = RepoExpectedSchema.parse({
      repo: 'sb',
      title: 'Storybook sample',
      correctFiles: ['src/Ok.tsx'],
      correctStories: ['button--primary'],
      issues: [
        {
          id: 'sb#1',
          story: 'button--icon',
          selector: '#close | .icon',
          wcag: ['4.1.2'],
          layer: 'static',
          description: 'x',
        },
        { id: 'sb#2', file: 'src/Tabs.tsx', line: 4, wcag: ['2.1.1'], description: 'y' },
      ],
    });
    const hit = storyFinding('button--icon', '#close', ['4.1.2'], 'violation');
    expect(repoFindingMatchesIssue(hit, expected.issues[0] as RepoExpectedIssue)).toBe(true);
    expect(
      repoFindingMatchesIssue(
        storyFinding('button--other', '#close', ['4.1.2'], 'violation'),
        expected.issues[0] as RepoExpectedIssue,
      ),
    ).toBe(false);
    expect(
      repoFindingMatchesIssue(
        storyFinding('button--icon', '#open', ['4.1.2'], 'violation'),
        expected.issues[0] as RepoExpectedIssue,
      ),
    ).toBe(false);
    const r = scoreRepoBenchmark([
      {
        expected,
        stories: 2,
        findings: [hit, storyFinding('button--primary', '#save', ['4.1.2'], 'violation')],
      },
    ]);
    expect(r).toMatchObject({
      stories: 2,
      matchedIssues: 1,
      violation: { total: 2, truePositive: 1, falsePositive: 1 },
      byLayer: { static: { expected: 1, matched: 1 }, repo: { expected: 1, matched: 0 } },
    });
    expect(r.correctFileNoise.map((n) => n.where)).toEqual(['story:button--primary #save']);
    expect(r.missed.map((m) => m.where)).toEqual(['src/Tabs.tsx:4']);
    expect(repoBenchmarkToMarkdown(r)).toContain('| static | 100.0% | 1/1 |');
  });

  it('rejects issues that are neither source nor story issues', () => {
    const parse = (i: object) =>
      RepoExpectedSchema.safeParse({ repo: 'x', title: 'x', issues: [i] }).success;
    const base = { id: 'a', wcag: ['1.1.1'], description: 'd' };
    expect(parse({ ...base, file: 'a.tsx', line: 1 })).toBe(true);
    expect(parse({ ...base, story: 's--a', selector: '#a' })).toBe(true);
    expect(parse(base)).toBe(false);
    expect(parse({ ...base, story: 's--a' })).toBe(false);
    expect(parse({ ...base, file: 'a.tsx', line: 1, story: 's--a', selector: '#a' })).toBe(false);
  });
});
