import { engineKeys } from '@clear-a11y/runner';
import { z } from 'zod';
import { MAX_PATH_LENGTH, MAX_URL_LENGTH } from './safety.js';

/**
 * Engines a client may pick. The AI judges and persona agents are not offered: this server never
 * calls a model (the calling agent is the judge) and personas need a config file.
 */
export const SELECTABLE_ENGINES = engineKeys().filter((k) => k !== 'ai' && k !== 'personas') as [
  string,
  ...string[],
];

export const MAX_URLS = 10;
export const MAX_CRAWL_PAGES = 50;
export const DEFAULT_CRAWL_PAGES = 10;
export const MAX_VIEWPORTS = 4;
export const TOP_FINDINGS = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_WALK_STOPS = 300;

const TIER = z.enum(['violation', 'likely', 'needs-review']);
const url = z.string().min(1).max(MAX_URL_LENGTH);
const viewport = z
  .string()
  .regex(
    /^(desktop|mobile|reflow|\d{2,5}x\d{2,5})$/,
    'use desktop, mobile, reflow or WIDTHxHEIGHT',
  );
const scanId = z.string().min(1).max(64).describe('The scanId returned by scan_url or scan_repo.');

// ---------- inputs (raw shapes: the SDK turns them into JSON Schema) ----------

export const scanUrlInput = {
  url: url.optional().describe('One http(s) URL to scan. Use `urls` for several.'),
  urls: z.array(url).max(MAX_URLS).optional().describe(`Up to ${MAX_URLS} http(s) URLs to scan.`),
  viewports: z
    .array(viewport)
    .min(1)
    .max(MAX_VIEWPORTS)
    .optional()
    .describe('Viewports: desktop (default), mobile, reflow (320 px wide) or WIDTHxHEIGHT.'),
  engines: z
    .array(z.enum(SELECTABLE_ENGINES))
    .min(1)
    .optional()
    .describe('Only run these engines. Default: all deterministic engines.'),
  states: z
    .boolean()
    .optional()
    .describe(
      'Also open and scan hidden states (menus, dialogs, form errors). Default true; false is faster.',
    ),
  crawl: z
    .boolean()
    .optional()
    .describe('Also scan same-origin pages linked from the URLs. Default false.'),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(MAX_CRAWL_PAGES)
    .optional()
    .describe(`Page limit when crawling (default ${DEFAULT_CRAWL_PAGES}, max ${MAX_CRAWL_PAGES}).`),
  screenshots: z
    .boolean()
    .optional()
    .describe(
      'Save screenshot crops as evidence files (paths are returned, never images). Default true.',
    ),
};

export const scanRepoInput = {
  path: z
    .string()
    .min(1)
    .max(MAX_PATH_LENGTH)
    .describe(
      'Local directory of the source repo (absolute, or relative to the server working directory).',
    ),
  storybookStatic: z
    .string()
    .min(1)
    .max(MAX_PATH_LENGTH)
    .optional()
    .describe(
      'Path to a built Storybook (storybook-static) to scan story by story, when supported.',
    ),
  runDevServer: z
    .boolean()
    .optional()
    .describe(
      "Start the repo's dev server and scan it, when supported. Runs the repo's own code: only for trusted repos, and only when the user asked. Default false.",
    ),
};

export const keyboardWalkInput = {
  url: url.describe('http(s) URL of the page to walk.'),
  viewport: viewport.optional().describe('desktop (default), mobile, reflow or WIDTHxHEIGHT.'),
  maxStops: z
    .number()
    .int()
    .min(1)
    .max(MAX_WALK_STOPS)
    .optional()
    .describe(`Most Tab presses (default 100, max ${MAX_WALK_STOPS}).`),
};

export const getFindingsInput = {
  scanId,
  tier: TIER.optional().describe('Only this tier.'),
  wcag: z
    .string()
    .regex(/^\d\.\d{1,2}\.\d{1,2}$/, 'a WCAG success criterion such as 1.4.3')
    .optional()
    .describe('Only findings for this WCAG success criterion, e.g. "2.4.7".'),
  engine: z
    .string()
    .max(64)
    .optional()
    .describe('Only this engine, e.g. "keyboard" or "engine-keyboard".'),
  ruleId: z
    .string()
    .max(128)
    .optional()
    .describe('Only this rule ("keyboard/focus-not-visible") or rule prefix ("keyboard").'),
  page: z
    .string()
    .max(MAX_URL_LENGTH)
    .optional()
    .describe('Only pages whose URL contains this text.'),
  findingId: z.string().max(128).optional().describe('Just this finding (use with detail: true).'),
  detail: z
    .boolean()
    .optional()
    .describe(
      'Include evidence: HTML snippet, accessibility tree, windowed focus path, measurements.',
    ),
  offset: z.number().int().min(0).optional().describe('Start index (default 0).'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .optional()
    .describe(`Page size (default 25, max ${MAX_PAGE_SIZE}).`),
};

export const REPORT_FORMATS = ['markdown', 'json', 'sarif', 'html'] as const;
export type McpReportFormat = (typeof REPORT_FORMATS)[number];

export const getReportInput = {
  scanId,
  format: z
    .enum(REPORT_FORMATS)
    .describe(
      'markdown (readable summary), json (canonical), sarif (code scanning) or html (for people).',
    ),
};

// ---------- outputs (structuredContent) ----------

const pageRef = z.object({ url: z.string(), state: z.string(), viewport: z.string() });
const focusStop = z.looseObject({
  index: z.number(),
  selector: z.string(),
  name: z.string().optional(),
  role: z.string().optional(),
  rect: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  backward: z.boolean().optional(),
});

export const compactFindingSchema = z.looseObject({
  id: z.string(),
  ruleId: z.string(),
  tier: TIER,
  confidence: z.number(),
  wcag: z.array(z.string()),
  engine: z.string(),
  page: pageRef,
  selector: z.string(),
  role: z.string().optional(),
  message: z.string(),
  fix: z.string().optional(),
  question: z.string().optional(),
  source: z
    .looseObject({
      file: z.string(),
      line: z.number(),
      column: z.number().optional(),
      component: z.string().optional(),
    })
    .optional(),
  screenshot: z.string().optional(),
  pageText: z.record(z.string(), z.string()).optional(),
  focusPath: z.array(focusStop).optional(),
  focusPathLength: z.number().optional(),
  data: z.string().optional(),
});

export const summarySchema = z.object({
  total: z.number(),
  violation: z.number(),
  likely: z.number(),
  needsReview: z.number(),
});

export const scanOutput = {
  scanId: z.string(),
  kind: z.enum(['url', 'repo']),
  targets: z.array(z.string()),
  pagesScanned: z.number(),
  summary: summarySchema,
  topFindings: z.array(compactFindingSchema),
  moreFindings: z.number(),
  errors: z.array(
    z.object({ engine: z.string(), url: z.string(), state: z.string(), message: z.string() }),
  ),
  errorCount: z.number(),
  notices: z.array(z.string()),
  reportDir: z.string(),
  untrusted: z.string(),
  next: z.string(),
};

export const keyboardWalkOutput = {
  url: z.string(),
  viewport: z.string(),
  stopCount: z.number(),
  stops: z.array(focusStop),
  backwardJumps: z.array(z.object({ from: z.number(), to: z.number() })),
  end: z.enum(['wrapped', 'cycle', 'max', 'frame']),
  cycle: z.array(z.string()).nullable(),
  fromTop: z.boolean(),
  untrusted: z.string(),
};

export const getFindingsOutput = {
  scanId: z.string(),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  nextOffset: z.number().nullable(),
  findings: z.array(compactFindingSchema),
  untrusted: z.string(),
};

export const getReportOutput = {
  scanId: z.string(),
  format: z.enum(REPORT_FORMATS),
  path: z.string(),
  bytes: z.number(),
  inline: z.boolean(),
  text: z.string().optional(),
  preview: z.string().optional(),
  untrusted: z.string(),
};
