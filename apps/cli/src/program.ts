import { dirname, isAbsolute, resolve } from 'node:path';
import { consoleLogger } from '@clear-a11y/browser';
import {
  resolveConfig,
  tierAtLeast,
  type Finding,
  type ScanResult,
  type Tier,
} from '@clear-a11y/core';
import {
  parseFormats,
  parseScanResult,
  toText,
  writeReports,
  type ReportFormat,
} from '@clear-a11y/reporter';
import {
  allRules,
  benchmarkToMarkdown,
  engineKeys,
  runFixtureBenchmark,
  scan,
  scanRepo,
  VERSION,
  type RepoRuntimeSummary,
} from '@clear-a11y/runner';
import { Command, InvalidArgumentError, Option } from 'commander';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildConfig, classifyTargets, parseList, parseTier, type ScanFlags } from './options.js';

export interface Io {
  out(text: string): void;
  err(text: string): void;
  setExitCode(code: number): void;
}

const processIo: Io = {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
  setExitCode: (c) => {
    process.exitCode = c;
  },
};

const intArg = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError('expected a positive integer');
  return n;
};
const wrap =
  <T>(fn: (v: string) => T) =>
  (v: string) => {
    try {
      return fn(v);
    } catch (err) {
      throw new InvalidArgumentError(err instanceof Error ? err.message : String(err));
    }
  };

/** One line about what the runtime layer of a repo scan covered (or how to enable it). */
export function runtimeNote(runtime: RepoRuntimeSummary): string {
  if (runtime.mode === 'none') return runtime.reason ?? 'Runtime checks skipped.';
  const what =
    runtime.mode === 'storybook'
      ? `${runtime.stories ?? 0} Storybook ${runtime.stories === 1 ? 'story' : 'stories'} from ${runtime.origin}`
      : `${runtime.pages} page(s) of the dev server at ${runtime.origin} (stopped after the scan)`;
  return `Repo scan: source lint plus ${what}, scanned with every enabled engine.`;
}

export function shouldFail(findings: readonly Finding[], failOn: Tier): boolean {
  return findings.some((f) => tierAtLeast(f.tier, failOn));
}

/** The CLI definition. Also used to generate the CLI reference docs. */
export function createProgram(io: Io = processIo): Command {
  const program = new Command('clear-a11y')
    .description(
      'Accessibility testing that works like a human expert: keyboard, states, reflow and the accessibility tree, not just rules.',
    )
    .version(VERSION)
    .configureOutput({ writeOut: io.out, writeErr: io.err })
    .exitOverride();

  program
    .command('scan')
    .description(
      "Scan one or more URLs, or a local source repo directory, and write a report. Only the URLs you list are scanned (plus same-origin links with --crawl). A repo is linted from source and, when it has a built Storybook, every story is scanned in the browser; the repo's dev server runs only with --boot.",
    )
    .argument('<targets...>', 'URLs to scan, or one path to a source repo')
    .option('-c, --config <file>', 'JSON config file (see docs: configuration)')
    .option('-o, --out <dir>', 'report directory', '.clear-a11y')
    .option(
      '-f, --format <list>',
      'report formats: json, sarif, html',
      wrap((v) => parseFormats(parseList(v))),
      ['json'],
    )
    .option(
      '--viewport <list>',
      'viewports: desktop, mobile, reflow or WIDTHxHEIGHT',
      wrap(parseList),
    )
    .option('--crawl', 'also scan same-origin pages linked from the targets')
    .option('--max-pages <n>', 'page limit when crawling', intArg)
    .addOption(
      new Option(
        '--engines <list>',
        `only run these engines (${engineKeys().join(', ')})`,
      ).argParser(wrap(parseList)),
    )
    .option(
      '--fail-on <tier>',
      'exit with code 1 when a finding at or above this tier exists: violation, likely, needs-review',
      wrap(parseTier),
    )
    .option('--no-screenshots', 'do not capture screenshot evidence')
    .option('--json', 'print the JSON report to stdout instead of a summary')
    .option(
      '--trust-repo-plugins',
      "repo scans: load lint plugins from the repo's own node_modules (Angular template rules). Runs code from the repo; only for repos you trust",
    )
    .option(
      '--storybook-url <url>',
      'repo scans: read stories from a Storybook already running on this machine (http://localhost:6006/)',
    )
    .option(
      '--storybook-static <dir>',
      'repo scans: built Storybook folder inside the repo (default: a detected storybook-static/)',
    )
    .option(
      '--boot',
      "repo scans without Storybook: start the app's dev script and crawl it. Runs the repo's code on this machine; only for repos you trust. Never installs dependencies",
    )
    .option('--max-stories <n>', 'repo scans: scan at most this many stories (default 50)', intArg)
    .action(async (targets: string[], flags: ScanFlags) => {
      const target = await classifyTargets(targets);
      const input = await buildConfig(flags);
      const config = resolveConfig(input);
      const outDir = isAbsolute(config.output.dir) ? config.output.dir : resolve(config.output.dir);
      const log = consoleLogger(flags.json ? 'warn' : 'info');
      const notes: string[] = [];
      let result: ScanResult;
      if (target.kind === 'repo') {
        const scanned = await scanRepo({
          path: target.path,
          config: input,
          toolVersion: VERSION,
          outDir,
          only: flags.engines,
          log,
        });
        result = scanned.result;
        notes.push(runtimeNote(scanned.runtime), ...scanned.runtime.notes);
      } else {
        result = await scan({
          targets: target.urls,
          config: input,
          outDir,
          only: flags.engines,
          log,
        });
      }
      const written = await writeReports(result, outDir, config.output.formats as ReportFormat[], {
        rules: allRules(),
        ...(target.kind === 'repo' ? { repoRoot: target.path } : {}),
      });
      if (flags.json) io.out(JSON.stringify(result, null, 2) + '\n');
      else {
        io.out(toText(result));
        for (const note of notes) io.out(`Note: ${note}\n`);
        for (const w of written) io.out(`Wrote ${w.format}: ${w.path}\n`);
      }
      if (shouldFail(result.findings, config.failOn)) io.setExitCode(1);
    });

  program
    .command('report')
    .description(
      'Render SARIF and/or HTML from an existing report.json (screenshots are read from its folder).',
    )
    .argument('<report>', 'path to a report.json written by `clear-a11y scan`')
    .option(
      '-f, --format <list>',
      'formats to write: json, sarif, html',
      wrap((v) => parseFormats(parseList(v))),
      ['html'] as ReportFormat[],
    )
    .option('-o, --out <dir>', 'output directory (default: the folder of <report>)')
    .action(async (reportPath: string, flags: { format: ReportFormat[]; out?: string }) => {
      const input = resolve(reportPath);
      const result = parseScanResult(await readFile(input, 'utf-8'));
      const written = await writeReports(
        result,
        resolve(flags.out ?? dirname(input)),
        flags.format,
        {
          rules: allRules(),
          artifactsDir: dirname(input),
        },
      );
      for (const w of written) io.out(`Wrote ${w.format}: ${w.path}\n`);
    });

  program
    .command('bench')
    .description(
      'Score Clear A11Y against a fixture site with expected findings (precision of violation, recall by WCAG SC and layer).',
    )
    .requiredOption('--site <dir>', 'directory with the fixture pages')
    .requiredOption('--expected <dir>', 'directory with expected-findings JSON files')
    .option('-o, --out <dir>', 'where to write latest.json and latest.md', 'bench-results')
    .option('--label <name>', 'also write <label>.json and <label>.md')
    .option('--filter <prefix>', 'only pages whose path starts with this prefix')
    .addOption(new Option('--engines <list>', 'only run these engines').argParser(wrap(parseList)))
    .action(
      async (flags: {
        site: string;
        expected: string;
        out: string;
        label?: string;
        filter?: string;
        engines?: string[];
      }) => {
        if (flags.label && !/^[a-z0-9][a-z0-9._-]*$/i.test(flags.label))
          throw new InvalidArgumentError('--label must be a simple name');
        const result = await runFixtureBenchmark({
          siteDir: resolve(flags.site),
          expectedDir: resolve(flags.expected),
          label: flags.label,
          filter: flags.filter,
          only: flags.engines,
        });
        const md = benchmarkToMarkdown(result);
        await mkdir(flags.out, { recursive: true });
        const json = JSON.stringify(result, null, 2) + '\n';
        await writeFile(join(flags.out, 'latest.json'), json);
        await writeFile(join(flags.out, 'latest.md'), md);
        if (flags.label) {
          await writeFile(join(flags.out, `${flags.label}.json`), json);
          await writeFile(join(flags.out, `${flags.label}.md`), md);
        }
        io.out(md);
      },
    );

  return program;
}

/** Runs the CLI. Returns the exit code instead of exiting, so it can be tested in-process. */
export async function run(argv: readonly string[], io: Io = processIo): Promise<number> {
  let code = 0;
  const program = createProgram({ ...io, setExitCode: (c) => (code = c) });
  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (err) {
    const e = err as { code?: string; exitCode?: number; message?: string };
    if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version') return 0;
    if (e.code?.startsWith('commander.')) return e.exitCode ?? 2;
    io.err(`clear-a11y: ${e.message ?? String(err)}\n`);
    return 2;
  }
  return code;
}
