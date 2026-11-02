/** What discovery knows about a form field (collected in the page). */
export interface FieldInfo {
  selector: string;
  tag: string;
  type: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  pattern?: string;
}

const TEXT_TYPES = new Set(['text', 'search', 'tel', 'password', 'email', 'url', '']);
const PATTERN_PROBES = ['!', 'zz', '0', 'a b', '-'];

/** Compiles an HTML `pattern` attribute the way browsers do (whole value, `v` flag). */
function compilePattern(pattern: string): RegExp | undefined {
  for (const flags of ['v', 'u']) {
    try {
      return new RegExp(`^(?:${pattern})$`, flags);
    } catch {
      // try the next flag set
    }
  }
  return undefined;
}

/**
 * A value that a correct form must reject, or `undefined` when the field has no constraint we can
 * break with typed text (empty submission covers `required`). Pure and deterministic.
 */
export function invalidValueFor(field: FieldInfo): string | undefined {
  const type = field.tag === 'textarea' ? 'text' : field.type.toLowerCase();
  if (type === 'email') return 'not-an-email';
  if (type === 'url') return 'not a url';
  if (type === 'number' || type === 'range') {
    const min = field.min !== undefined ? Number(field.min) : NaN;
    const max = field.max !== undefined ? Number(field.max) : NaN;
    if (Number.isFinite(min)) return String(min - 1);
    if (Number.isFinite(max)) return String(max + 1);
    return undefined;
  }
  if (!TEXT_TYPES.has(type)) return undefined;
  if (field.pattern) {
    const re = compilePattern(field.pattern);
    const probe = re && PATTERN_PROBES.find((p) => !re.test(p));
    if (probe !== undefined) return probe;
  }
  if (field.minLength !== undefined && field.minLength > 1) {
    return 'a'.repeat(field.minLength - 1);
  }
  return undefined;
}
