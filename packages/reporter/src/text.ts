import { compareTiers, getSuccessCriterion, type ScanResult } from '@clear-a11y/core';

/** Short human summary for terminals. */
export function toText(result: ScanResult, options: { maxPerTier?: number } = {}): string {
  const max = options.maxPerTier ?? 20;
  const lines: string[] = [];
  const { byTier } = result.summary;
  lines.push(
    `Scanned ${result.pages.length} page view(s): ${result.summary.total} finding(s) — ` +
      `${byTier['violation'] ?? 0} violation, ${byTier['likely'] ?? 0} likely, ${byTier['needs-review'] ?? 0} needs review.`,
  );
  const sorted = [...result.findings].sort(
    (a, b) => compareTiers(a.tier, b.tier) || a.ruleId.localeCompare(b.ruleId),
  );
  for (const tier of ['violation', 'likely', 'needs-review'] as const) {
    const items = sorted.filter((f) => f.tier === tier);
    if (!items.length) continue;
    lines.push('', `${tier.toUpperCase()} (${items.length})`);
    for (const f of items.slice(0, max)) {
      const sc = f.wcag.map((s) => `${s} ${getSuccessCriterion(s)?.title ?? ''}`.trim()).join('; ');
      lines.push(
        `  ${f.ruleId}  ${f.target.selector}`,
        `    ${f.message}`,
        `    WCAG ${sc} · ${f.page.url}${f.page.state !== 'default' ? ` [${f.page.state}]` : ''}`,
      );
    }
    if (items.length > max) lines.push(`  … and ${items.length - max} more`);
  }
  for (const e of result.errors)
    lines.push(`! ${e.engine} failed on ${e.url} [${e.state}]: ${e.message}`);
  return lines.join('\n') + '\n';
}
