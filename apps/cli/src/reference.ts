import type { Command, Option } from 'commander';

/** Machine-readable description of the CLI, read by the docs site's generator. */
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
  arguments: CliArgument[];
  options: CliOption[];
}

export interface CliArgument {
  name: string;
  description: string;
  required: boolean;
  variadic: boolean;
}

export interface CliOption {
  flags: string;
  description: string;
  /** Default shown in the docs, as a string ("json", "50"). Absent when there is none. */
  default?: string;
  /** The option must be given. */
  required: boolean;
  /** A `--no-*` flag that turns something off. */
  negate: boolean;
}

function formatDefault(value: unknown): string | undefined {
  if (value === undefined || value === null || typeof value === 'boolean') return undefined;
  if (Array.isArray(value)) return value.map(String).join(',');
  return String(value);
}

function describeOption(option: Option): CliOption {
  const def = option.negate ? undefined : formatDefault(option.defaultValue);
  return {
    flags: option.flags,
    description: option.description,
    ...(def !== undefined ? { default: def } : {}),
    required: option.mandatory,
    negate: option.negate,
  };
}

function describeCommand(command: Command): CliCommand {
  return {
    name: command.name(),
    description: command.description(),
    usage: `${command.parent?.name() ?? ''} ${command.name()} ${command.usage()}`.trim(),
    arguments: command.registeredArguments.map((a) => ({
      name: a.name(),
      description: a.description,
      required: a.required,
      variadic: a.variadic,
    })),
    options: command.options.filter((o) => !o.hidden).map(describeOption),
  };
}

/** Describes a commander program (commands, arguments, options, defaults) for the docs. */
export function describeProgram(program: Command): CliReference {
  return {
    name: program.name(),
    description: program.description(),
    version: program.version() ?? '',
    options: program.options.filter((o) => !o.hidden).map(describeOption),
    commands: program.commands.map(describeCommand),
  };
}
