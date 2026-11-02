import { names } from '@nx/devkit';

/** Accepts "keyboard", "Keyboard" or "focus-order-backward" and returns the usual name variants. */
export function nameVariants(raw: string) {
  const n = names(raw.trim());
  return { fileName: n.fileName, className: n.className, propertyName: n.propertyName };
}

export function parseWcag(raw: string | string[] | undefined): string[] {
  const list = Array.isArray(raw) ? raw : (raw ?? '').split(',');
  const scs = list.map((s) => s.trim()).filter(Boolean);
  for (const sc of scs) {
    if (!/^\d\.\d{1,2}\.\d{1,2}$/.test(sc)) {
      throw new Error(`"${sc}" is not a WCAG success criterion number like 2.4.3`);
    }
  }
  return scs;
}
