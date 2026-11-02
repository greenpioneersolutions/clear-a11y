import { cell, prose } from './markdown.ts';
import { href, type Page } from './page.ts';

/** Shape of apps/cli/dist/cli-reference.json (written by `nx run cli:docs-json`). */
export interface CliReference {
  name: string;
  description: string;
  version: string;
  options: CliOption[];
  commands: CliCommand[];
}
export interface CliCommand {
  name: string;
  description: string;
  usage: string;
  arguments: Array<{ name: string; description: string; required: boolean; variadic: boolean }>;
  options: CliOption[];
}
export interface CliOption {
  flags: string;
  description: string;
  default?: string;
  required: boolean;
  negate: boolean;
}

/** Throws when the JSON doesn't look like a CLI reference (a stale or foreign file). */
export function parseCliReference(json: string): CliReference {
  const data = JSON.parse(json) as Partial<CliReference>;
  if (
    typeof data.name !== 'string' ||
    !Array.isArray(data.commands) ||
    !Array.isArray(data.options)
  )
    throw new Error(
      'cli-reference.json is not a CLI reference (expected name, options and commands).',
    );
  return data as CliReference;
}

const sentence = (text: string) => {
  const t = text.trim();
  if (!t) return t;
  const upper = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?)]$/.test(upper) ? upper : `${upper}.`;
};

function optionsTable(options: readonly CliOption[]): string {
  const rows = options.map((o) => {
    const notes = [
      ...(o.required ? ['Required.'] : []),
      ...(o.default !== undefined ? [`Default: \`${o.default}\`.`] : []),
    ];
    return `| \`${cell(o.flags)}\` | ${prose([sentence(o.description), ...notes].join(' '))} |`;
  });
  return ['| Option | What it does |', '| --- | --- |', ...rows].join('\n');
}

export const CLI_SLUG = 'reference/cli';

/** Renders the CLI reference page from the JSON the CLI writes about itself. */
export function renderCliReference(ref: CliReference): Page {
  const commands = ref.commands.map((c) => {
    const parts = [
      `## \`${ref.name} ${c.name}\``,
      sentence(c.description),
      '```sh\n' + c.usage + '\n```',
    ];
    if (c.arguments.length > 0)
      parts.push(
        [
          '| Argument | What it is |',
          '| --- | --- |',
          ...c.arguments.map(
            (a) =>
              `| \`${a.required ? '<' : '['}${a.name}${a.variadic ? '...' : ''}${a.required ? '>' : ']'}\` | ${prose(sentence(a.description))}${a.required ? ' Required.' : ''}${a.variadic ? ' You can give more than one.' : ''} |`,
          ),
        ].join('\n'),
      );
    if (c.options.length > 0) parts.push(optionsTable(c.options));
    return parts.join('\n\n');
  });
  return {
    slug: CLI_SLUG,
    title: 'CLI reference',
    description: `Every command and option of the ${ref.name} command line.`,
    body: [
      `${sentence(ref.description)} This page is generated from the CLI's own definition, so it always matches \`${ref.name} --help\`. For a guided tour, read the [CLI guide](${href('guides/cli')}).`,
      `Global options: ${ref.options.map((o) => `\`${o.flags}\` (${o.description})`).join(', ')}${ref.options.length ? ', ' : ''}and \`-h, --help\` on every command.`,
      'Exit codes: `0` success, `1` a finding at or above `--fail-on` exists, `2` usage or runtime error.',
      ...commands,
    ].join('\n\n'),
  };
}
