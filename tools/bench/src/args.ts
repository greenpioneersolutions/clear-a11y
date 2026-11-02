export interface BenchArgs {
  label?: string;
  out: string;
  filter?: string;
  concurrency: number;
  /** Only these engine keys, e.g. ["static"] for the axe-only baseline. */
  engines?: string[];
}

/** Parses `--label=x --out=dir --filter=keyboard/ --concurrency=2` (also accepts `--flag value`). */
export function parseArgs(argv: readonly string[]): BenchArgs {
  const get = (name: string): string | undefined => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i < 0) return undefined;
    const arg = argv[i] as string;
    return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[i + 1];
  };
  const label = get('label');
  if (label !== undefined && !/^[a-z0-9][a-z0-9._-]*$/i.test(label)) {
    throw new Error(`--label must be a simple name (letters, digits, . _ -), got "${label}"`);
  }
  return {
    ...(label ? { label } : {}),
    out: get('out') ?? 'bench-results',
    ...(get('filter') ? { filter: get('filter') } : {}),
    concurrency: Number(get('concurrency') ?? 4),
    ...(get('engines') ? { engines: (get('engines') as string).split(',').filter(Boolean) } : {}),
  };
}
