import { describe, expect, it } from 'vitest';
import { parseCliReference, renderCliReference, type CliReference } from './cli.ts';

const sample: CliReference = {
  name: 'clear-a11y',
  description: 'Accessibility testing',
  version: '0.1.0',
  options: [
    {
      flags: '-V, --version',
      description: 'output the version number',
      required: false,
      negate: false,
    },
  ],
  commands: [
    {
      name: 'scan',
      description: 'Scan URLs.',
      usage: 'clear-a11y scan [options] <targets...>',
      arguments: [{ name: 'targets', description: 'URLs to scan', required: true, variadic: true }],
      options: [
        {
          flags: '-o, --out <dir>',
          description: 'report directory',
          default: '.clear-a11y',
          required: false,
          negate: false,
        },
        { flags: '--site <dir>', description: 'fixture | pages', required: true, negate: false },
        {
          flags: '--no-screenshots',
          description: 'do not capture screenshots',
          required: false,
          negate: true,
        },
      ],
    },
  ],
};

describe('renderCliReference', () => {
  const page = renderCliReference(sample);

  it('renders one section per command with usage, arguments and options', () => {
    expect(page.slug).toBe('reference/cli');
    expect(page.body).toContain('## `clear-a11y scan`');
    expect(page.body).toContain('```sh\nclear-a11y scan [options] <targets...>\n```');
    expect(page.body).toContain(
      '| `<targets...>` | URLs to scan. Required. You can give more than one. |',
    );
    expect(page.body).toContain(
      '| `-o, --out <dir>` | Report directory. Default: `.clear-a11y`. |',
    );
    expect(page.body).toContain('| `--site <dir>` | Fixture \\| pages. Required. |');
    expect(page.body).toContain('| `--no-screenshots` | Do not capture screenshots. |');
  });

  it('mentions the global options and exit codes', () => {
    expect(page.body).toContain('`-V, --version` (output the version number)');
    expect(page.body).toContain('Exit codes: `0` success');
  });
});

describe('parseCliReference', () => {
  it('accepts the CLI JSON and rejects anything else', () => {
    expect(parseCliReference(JSON.stringify(sample)).commands).toHaveLength(1);
    expect(() => parseCliReference('{"name":"x"}')).toThrow(/not a CLI reference/);
  });
});
