import type { Engine } from '@clear-a11y/browser';
import type { ClearA11yConfig } from '@clear-a11y/core';
import { createKeyboardEngine } from '@clear-a11y/engine-keyboard';
import { createStaticEngine } from '@clear-a11y/engine-static';
import { createStatesEngine } from '@clear-a11y/engine-states';
import { createVisualEngine } from '@clear-a11y/engine-visual';
import { createAtEngine } from '@clear-a11y/engine-at';
import { createWidgetsEngine } from '@clear-a11y/engine-widgets';
import {
  createAiEngine,
  createPersonaEngine,
  createProvider,
  hasPersonaTasks,
} from '@clear-a11y/ai';

export interface EngineRegistration {
  /** Key in `config.engines` that toggles this engine (static, keyboard, states, visual, at, widgets, ai, personas). */
  key: string;
  /** Extra condition on top of the toggle, e.g. AI judges only when a provider is configured. */
  enabled?(config: ClearA11yConfig): boolean;
  create(config: ClearA11yConfig): Engine;
}

/** The engine registry: one line per engine. Engines never import each other; the runner wires them. */
export const ENGINE_REGISTRY: EngineRegistration[] = [
  { key: 'static', create: () => createStaticEngine() },
  { key: 'keyboard', create: () => createKeyboardEngine() },
  { key: 'states', create: () => createStatesEngine() },
  { key: 'visual', create: () => createVisualEngine() },
  { key: 'at', create: () => createAtEngine() },
  { key: 'widgets', create: () => createWidgetsEngine() },
  // AI judges: registered only when the user configured a provider. With the default `none`,
  // nothing is created and no page content can leave the machine.
  {
    key: 'ai',
    enabled: (config) => config.ai.provider !== 'none',
    create: (config) => createAiEngine(config, createProvider(config.ai)),
  },
  // Persona agents: only when config.personas lists tasks. The deterministic planner needs no AI;
  // the AI planner gets a provider only when one is configured.
  {
    key: 'personas',
    enabled: (config) => hasPersonaTasks(config.personas),
    create: (config) =>
      createPersonaEngine(
        config,
        config.ai.provider === 'none' ? undefined : createProvider(config.ai),
      ),
  },
];

/** Engines enabled by config (and, if given, limited to `only` keys). */
export function createEngines(
  config: ClearA11yConfig,
  only?: readonly string[],
  registry = ENGINE_REGISTRY,
): Engine[] {
  const toggles = config.engines as Record<string, boolean | undefined>;
  return registry
    .filter((r) => (only?.length ? only.includes(r.key) : toggles[r.key] !== false))
    .filter((r) => r.enabled?.(config) ?? true)
    .map((r) => r.create(config));
}

export const engineKeys = (registry = ENGINE_REGISTRY): string[] => registry.map((r) => r.key);
