import { Command, Option } from 'commander';
import { createProgram } from './program.js';
import { describeProgram } from './reference.js';

describe('describeProgram', () => {
  it('describes commands, arguments, options and defaults', () => {
    const program = new Command('tool').description('A tool.').version('1.2.3');
    program
      .command('run')
      .description('Run it.')
      .argument('<targets...>', 'what to run')
      .option('-o, --out <dir>', 'output folder', 'out')
      .option('-f, --format <list>', 'formats', ['json'])
      .requiredOption('--site <dir>', 'site folder')
      .option('--no-screenshots', 'skip screenshots')
      .addOption(new Option('--secret').hideHelp());

    const ref = describeProgram(program);
    expect(ref).toMatchObject({ name: 'tool', description: 'A tool.', version: '1.2.3' });
    expect(ref.options.map((o) => o.flags)).toEqual(['-V, --version']);
    const [run] = ref.commands;
    expect(run).toMatchObject({
      name: 'run',
      usage: 'tool run [options] <targets...>',
      arguments: [{ name: 'targets', description: 'what to run', required: true, variadic: true }],
    });
    expect(run?.options).toEqual([
      {
        flags: '-o, --out <dir>',
        description: 'output folder',
        default: 'out',
        required: false,
        negate: false,
      },
      {
        flags: '-f, --format <list>',
        description: 'formats',
        default: 'json',
        required: false,
        negate: false,
      },
      { flags: '--site <dir>', description: 'site folder', required: true, negate: false },
      { flags: '--no-screenshots', description: 'skip screenshots', required: false, negate: true },
    ]);
  });

  it('covers every command of the real CLI', () => {
    const ref = describeProgram(createProgram());
    expect(ref.name).toBe('clear-a11y');
    expect(ref.commands.map((c) => c.name)).toEqual(['scan', 'report', 'bench']);
    const scan = ref.commands[0];
    expect(scan?.options.find((o) => o.flags.includes('--out'))?.default).toBe('.clear-a11y');
    expect(scan?.options.every((o) => o.description.length > 0)).toBe(true);
  });
});
