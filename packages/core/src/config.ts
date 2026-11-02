import { z } from 'zod';
import { TierSchema } from './finding.js';

export const ViewportSchema = z.object({
  name: z.string().describe('A name for the viewport, shown in findings ("desktop", "mobile").'),
  width: z.number().int().positive().describe('Width in CSS pixels.'),
  height: z.number().int().positive().describe('Height in CSS pixels.'),
});
export type Viewport = z.infer<typeof ViewportSchema>;

export const DEFAULT_VIEWPORTS: Viewport[] = [{ name: 'desktop', width: 1280, height: 800 }];

export const AI_PROVIDERS = [
  'none',
  'mock',
  'anthropic',
  'openai',
  'bedrock',
  'vertex',
  'azure',
  'ollama',
] as const;
export const AiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProviderName = z.infer<typeof AiProviderSchema>;

/** Per-engine options. Each engine validates its own section, so engines can add options without changing core. */
const looseSection = (description: string) =>
  z.record(z.string(), z.unknown()).default({}).describe(description);

const engineToggles = z
  .object({
    static: z.boolean().default(true).describe('axe-core rules (the static layer).'),
    states: z
      .boolean()
      .default(true)
      .describe(
        'Opens menus, dialogs, accordions and form error states so every engine also tests them.',
      ),
    keyboard: z
      .boolean()
      .default(true)
      .describe('Walks the page with the Tab key: focus order, focus visible, traps, skip links.'),
    visual: z
      .boolean()
      .default(true)
      .describe(
        'Reflow at 320 px, text resize and spacing, real-pixel contrast, target size, hover content.',
      ),
    at: z
      .boolean()
      .default(true)
      .describe('The accessibility tree: names, roles, states, labels, errors and announcements.'),
    widgets: z
      .boolean()
      .default(true)
      .describe(
        'Keyboard contracts of ARIA widgets: tabs, menus, comboboxes, listboxes, grids, dialogs.',
      ),
  })
  .prefault({})
  .describe('Turn individual engines on or off. All are on by default.');

/**
 * The config file. Every field carries a `.describe()` text: it is the user-facing description in
 * the generated configuration reference (and in `z.toJSONSchema(ConfigSchema)`).
 */
export const ConfigSchema = z.object({
  targets: z
    .array(z.string())
    .default([])
    .describe(
      'URLs to scan, in addition to the ones on the command line. Clear A11Y never scans anything you did not list (plus same-origin links when crawling is on).',
    ),
  crawl: z
    .object({
      enabled: z
        .boolean()
        .default(false)
        .describe('Also scan same-origin pages linked from the targets. Same as `--crawl`.'),
      maxPages: z
        .number()
        .int()
        .positive()
        .default(20)
        .describe('Stop after this many pages. Same as `--max-pages`.'),
      sameOrigin: z
        .boolean()
        .default(true)
        .describe('Only follow links to the same origin as the target.'),
      include: z
        .array(z.string())
        .default([])
        .describe('Only follow links whose URL matches one of these patterns.'),
      exclude: z
        .array(z.string())
        .default([])
        .describe('Never follow links whose URL matches one of these patterns.'),
    })
    .prefault({})
    .describe('Following links from the targets. Off by default.'),
  viewports: z
    .array(ViewportSchema)
    .min(1)
    .default(DEFAULT_VIEWPORTS)
    .describe(
      'Screen sizes to scan each page at. Every page and state is scanned once per viewport. Same as `--viewport`.',
    ),
  engines: engineToggles,
  ai: z
    .looseObject({
      provider: AiProviderSchema.default('none').describe(
        'Which model to use. The default `none` means no page content ever leaves your machine. Bring your own API key or a local model; consumer chat-subscription logins are not supported.',
      ),
      model: z
        .string()
        .optional()
        .describe(
          'Model name for the provider, for example a Claude or GPT model, or an Ollama model tag.',
        ),
      apiKeyEnv: z
        .string()
        .optional()
        .describe(
          'Name of the environment variable that holds the API key. Keys are never stored in the config file.',
        ),
      baseUrl: z
        .string()
        .optional()
        .describe(
          'Custom endpoint, for example a local Ollama server or an Azure OpenAI resource.',
        ),
      judges: z
        .array(z.string())
        .default([])
        .describe('Which AI judges to run. Empty runs every judge.'),
      region: z.string().optional().describe('Cloud region (Amazon Bedrock, Google Vertex AI).'),
      project: z.string().optional().describe('Cloud project (Google Vertex AI).'),
    })
    .prefault({})
    .describe(
      'Optional AI judges for judgment calls. See AI providers. AI findings are never `violation`s.',
    ),
  static: looseSection('Options for the static engine. Each engine checks its own options.'),
  keyboard: looseSection('Options for the keyboard engine.'),
  states: looseSection('Options for the state explorer.'),
  visual: looseSection('Options for the visual engine.'),
  widgets: looseSection('Options for the widget engine.'),
  repo: looseSection('Options for repo scanning (listed below).'),
  personas: looseSection('Persona tasks to run. See Persona agents.'),
  at: z
    .looseObject({
      guidepup: z
        .boolean()
        .default(false)
        .describe(
          'Also run a real screen reader through Guidepup. Opt-in only, needs a desktop session, and is never required in CI.',
        ),
    })
    .prefault({})
    .describe('Options for the accessibility-tree engine.'),
  auth: z
    .object({
      storageState: z
        .string()
        .optional()
        .describe(
          'Path to a Playwright storage-state file with a logged-in session. Never commit this file.',
        ),
    })
    .prefault({})
    .describe('Scanning pages behind a login.'),
  output: z
    .object({
      dir: z.string().default('.clear-a11y').describe('Report folder. Same as `--out`.'),
      formats: z
        .array(z.enum(['json', 'sarif', 'html']))
        .default(['json'])
        .describe('Report formats to write. Same as `--format`.'),
      screenshots: z
        .boolean()
        .default(true)
        .describe('Capture screenshot crops as evidence. Same as `--no-screenshots` when false.'),
    })
    .prefault({})
    .describe('Where and how reports are written.'),
  failOn: TierSchema.default('violation').describe(
    'Lowest tier that makes the command exit with code 1. `violation` (the default) is safe for CI. Same as `--fail-on`.',
  ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(30_000)
    .describe('Time limit for each page and state, in milliseconds.'),
});

export type ClearA11yConfig = z.infer<typeof ConfigSchema>;
export type ClearA11yConfigInput = z.input<typeof ConfigSchema>;

export function resolveConfig(input: ClearA11yConfigInput = {}): ClearA11yConfig {
  return ConfigSchema.parse(input);
}
