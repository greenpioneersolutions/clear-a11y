import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import {
  benchmarkToMarkdown,
  repoBenchmarkToMarkdown,
  runFixtureBenchmark,
  runRepoBenchmark,
} from '@clear-a11y/runner';
import {
  findWorkspaceRoot,
  fixturesExpectedDir,
  fixturesPersonasFile,
  fixturesReposDir,
  fixturesSiteDir,
} from '@clear-a11y/test-utils';
import { parseArgs } from './args.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = findWorkspaceRoot();
  const outDir = isAbsolute(args.out) ? args.out : join(root, args.out);
  // Persona tasks for the fixture pages (deterministic planner, no AI needed).
  const personasFile = fixturesPersonasFile();
  const personas = existsSync(personasFile)
    ? (JSON.parse(await readFile(personasFile, 'utf-8')) as Record<string, unknown>)
    : undefined;
  const result = await runFixtureBenchmark({
    ...(personas ? { personas } : {}),
    siteDir: fixturesSiteDir(),
    expectedDir: fixturesExpectedDir(),
    label: args.label,
    filter: args.filter,
    concurrency: args.concurrency,
    only: args.engines,
    onPage: (page, n) => console.log(`  ${page}: ${n} finding(s)`),
  });
  // Repo layer: static lint of fixtures/repos/*, scored separately (site numbers are unchanged).
  const repo =
    !args.filter || args.filter.startsWith('repos')
      ? await runRepoBenchmark({
          reposDir: fixturesReposDir(),
          onRepo: (name, n) => console.log(`  repos/${name}: ${n} finding(s)`),
        })
      : undefined;
  const json = JSON.stringify(repo ? { ...result, repo } : result, null, 2) + '\n';
  const md = benchmarkToMarkdown(result) + (repo ? `\n${repoBenchmarkToMarkdown(repo)}` : '');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'latest.json'), json);
  await writeFile(join(outDir, 'latest.md'), md);
  if (args.label) {
    await writeFile(join(outDir, `${args.label}.json`), json);
    await writeFile(join(outDir, `${args.label}.md`), md);
  }
  const p = result.violation.precision;
  console.log(
    `\nRecall ${(result.recall * 100).toFixed(1)}% (${result.matchedIssues}/${result.expectedIssues}) · ` +
      `violation precision ${p === null ? 'n/a' : (p * 100).toFixed(1) + '%'} (${result.violation.truePositive}/${result.violation.total}) · ` +
      `noise on correct pages ${result.correctPatternNoise.length}`,
  );
  if (repo) {
    const rp = repo.violation.precision;
    console.log(
      `Repo layer: recall ${(repo.recall * 100).toFixed(1)}% (${repo.matchedIssues}/${repo.expectedIssues}) · ` +
        `violation precision ${rp === null ? 'n/a' : (rp * 100).toFixed(1) + '%'} (${repo.violation.truePositive}/${repo.violation.total}) · ` +
        `noise in correct files ${repo.correctFileNoise.length}`,
    );
  }
  console.log(`Report: ${join(outDir, 'latest.md')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
