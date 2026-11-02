import { z } from 'zod';
import { TierSchema } from './finding.js';

/** Static metadata for a rule. Used by engines, the docs generator and reports. */
export const RuleMetaSchema = z.object({
  /** "<layer>/<name>", e.g. "keyboard/focus-order-backward", or "repo/<plugin>/<rule>". */
  id: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/),
  /** Producing engine, e.g. "engine-keyboard". */
  engine: z.string(),
  wcag: z.array(z.string()).min(1),
  tier: TierSchema,
  title: z.string(),
  /** What it catches and who it affects. */
  description: z.string(),
  fix: z.string(),
});
export type RuleMeta = z.infer<typeof RuleMetaSchema>;

/** Engine layers used for benchmark reporting. */
export const LAYERS = [
  'static',
  'keyboard',
  'states',
  'visual',
  'at',
  'widgets',
  'ai',
  'persona',
  'repo',
] as const;
export type Layer = (typeof LAYERS)[number];

/** Maps an engine name ("engine-keyboard", "ai-alt-text", "persona-keyboard") to its layer. */
export function layerOf(engine: string): string {
  if (engine.startsWith('ai-')) return 'ai';
  if (engine.startsWith('persona-')) return 'persona';
  if (engine.startsWith('repo-')) return 'repo';
  if (engine.startsWith('engine-')) return engine.slice('engine-'.length);
  return engine;
}
