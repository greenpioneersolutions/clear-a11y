import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { TIERS, type ClearA11yConfigInput, type Tier } from '@clear-a11y/core';
import { isRoutePath, parseRouteMap, type RouteMap } from '@clear-a11y/repo';
import { parseFormats, type ReportFormat } from '@clear-a11y/reporter';

export type FailOn = Tier | 'never';

/** The action's inputs after parsing and validation. Paths are absolute. */
export interface ActionInputs {
  baseUrl?: string;
  routes: RouteMap;
  defaultTargets: string[];
  repoPath: string;
  configPath?: string;
  config: ClearA11yConfigInput;
  storybookStatic?: string;
  changedOnly: boolean;
  failOn: FailOn;
  formats: ReportFormat[];
  outDir: string;
  maxPages: number;
  baseSha?: string;
  headSha?: string;
  comment: boolean;
  githubToken?: string;
  artifactName: string;
}

/** Reads one input by its action.yml name ("" when unset), like `core.getInput`. */
export type GetInput = (name: string) => string;

export interface ReadInputsOptions {
  /** Relative paths are resolved against this folder (GITHUB_WORKSPACE). */
  cwd: string;
  readText?: (path: string) => Promise<string>;
}

/** Newline- or comma-separated list, trimmed, empty entries dropped. */
export const parseList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

export function parseBoolean(name: string, value: string, fallback: boolean): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  if (['true', 'yes', '1', 'on'].includes(v)) return true;
  if (['false', 'no', '0', 'off'].includes(v)) return false;
  throw new Error(`Input "${name}" must be true or false, got "${value}".`);
}

export function parseFailOn(value: string): FailOn {
  const v = value.trim() || 'violation';
  if (v === 'never' || (TIERS as readonly string[]).includes(v)) return v as FailOn;
  throw new Error(`Input "fail-on" must be one of ${[...TIERS, 'never'].join(', ')}, got "${v}".`);
}

export function parseBaseUrl(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new Error(`Input "base-url" must be an http(s) URL, got "${v}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(`Input "base-url" must be an http(s) URL, got "${v}".`);
  return url.href;
}

const SHA = /^[0-9a-f]{7,64}$/i;
function parseSha(name: string, value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!SHA.test(v)) throw new Error(`Input "${name}" must be a commit SHA, got "${v}".`);
  return v;
}

function parsePositiveInt(name: string, value: string, fallback: number): number {
  const v = value.trim();
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`Input "${name}" must be a positive integer, got "${v}".`);
  return n;
}

const abs = (cwd: string, p: string) => (isAbsolute(p) ? p : resolve(cwd, p));

/**
 * The route map input: inline JSON (`{"src/pages/checkout/**": ["/checkout"]}`) or the path of a
 * JSON file with the same shape.
 */
export async function parseRoutesInput(
  value: string,
  cwd: string,
  readText: (path: string) => Promise<string>,
): Promise<RouteMap> {
  const v = value.trim();
  if (!v) return {};
  let text = v;
  let from = 'the "routes" input';
  if (!v.startsWith('{')) {
    from = v;
    text = await readText(abs(cwd, v)).catch((err: Error) => {
      throw new Error(`Could not read the routes file "${v}": ${err.message}`);
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`${from} is not valid JSON: ${(err as Error).message}`);
  }
  return parseRouteMap(json);
}

/** Reads and validates every input. Throws a message that names the bad input. */
export async function readInputs(get: GetInput, options: ReadInputsOptions): Promise<ActionInputs> {
  const { cwd } = options;
  const readText = options.readText ?? ((p: string) => readFile(p, 'utf-8'));
  const configPath = get('config').trim() ? abs(cwd, get('config').trim()) : undefined;
  let config: ClearA11yConfigInput = {};
  if (configPath) {
    const text = await readText(configPath).catch((err: Error) => {
      throw new Error(`Could not read the config file "${get('config')}": ${err.message}`);
    });
    try {
      config = JSON.parse(text) as ClearA11yConfigInput;
    } catch (err) {
      throw new Error(`The config file is not valid JSON: ${(err as Error).message}`);
    }
  }
  const defaultTargets = parseList(get('default-targets'));
  const badDefault = defaultTargets.find((t) => !isRoutePath(t));
  if (badDefault)
    throw new Error(
      `Input "default-targets" takes paths on the base URL that start with "/", got "${badDefault}".`,
    );
  const formats = parseFormats(parseList(get('formats') || 'sarif,html'));
  const token = get('github-token').trim();
  return {
    baseUrl: parseBaseUrl(get('base-url')),
    routes: await parseRoutesInput(get('routes'), cwd, readText),
    defaultTargets,
    repoPath: abs(cwd, get('repo-path').trim() || '.'),
    ...(configPath ? { configPath } : {}),
    config,
    ...(get('storybook-static').trim()
      ? { storybookStatic: abs(cwd, get('storybook-static').trim()) }
      : {}),
    changedOnly: parseBoolean('changed-only', get('changed-only'), true),
    failOn: parseFailOn(get('fail-on')),
    formats,
    outDir: abs(cwd, get('out-dir').trim() || 'clear-a11y-report'),
    maxPages: parsePositiveInt('max-pages', get('max-pages'), 25),
    ...(parseSha('base-sha', get('base-sha')) ? { baseSha: get('base-sha').trim() } : {}),
    ...(parseSha('head-sha', get('head-sha')) ? { headSha: get('head-sha').trim() } : {}),
    comment: parseBoolean('comment', get('comment'), false),
    ...(token ? { githubToken: token } : {}),
    artifactName: get('artifact-name').trim() || 'clear-a11y-report',
  };
}
