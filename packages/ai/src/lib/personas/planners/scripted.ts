import type { PersonaAction, PersonaPlanner } from '../types.js';

/** A fixed list of actions (tests of the executor). Answers `done` once the list runs out. */
export function createScriptedPlanner(actions: readonly PersonaAction[]): PersonaPlanner {
  let i = 0;
  return {
    kind: 'deterministic',
    async next() {
      return actions[i++] ?? { type: 'done', reason: 'script finished' };
    },
  };
}
