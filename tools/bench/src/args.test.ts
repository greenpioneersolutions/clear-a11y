import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('uses defaults', () => {
    expect(parseArgs([])).toEqual({ out: 'bench-results', concurrency: 4 });
  });

  it('reads both --flag=value and --flag value', () => {
    expect(
      parseArgs(['--label=s01-axe', '--out', 'tmp', '--filter=keyboard/', '--concurrency=4']),
    ).toEqual({
      label: 's01-axe',
      out: 'tmp',
      filter: 'keyboard/',
      concurrency: 4,
    });
  });

  it('rejects labels that could escape the output directory', () => {
    expect(() => parseArgs(['--label=../x'])).toThrow(/simple name/);
  });
});
