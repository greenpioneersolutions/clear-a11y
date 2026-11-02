import type { StepHint } from '../config.js';
import { describeHint, nameMatches, rolesMatch, SPACE_FIRST_ROLES } from '../match.js';
import type {
  KeyboardObservation,
  Observation,
  PersonaAction,
  PersonaPlanner,
  SrNode,
  SrObservation,
} from '../types.js';

/** Roles a screen reader user can operate (used when a hint has no role). */
export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'switch',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'slider',
  'spinbutton',
  'treeitem',
]);

/**
 * Deterministic keyboard-only planner. For each hint it presses Tab until the focused element's
 * name matches, then presses Enter (Space first for checkboxes and radios) and falls back to the
 * other key when nothing changed; `type` hints type the text. It gives up when:
 * - Tab went all the way around the page (focus left the document and came back to a stop it
 *   already saw) without reaching the target: `unreachable`;
 * - focus circles without ever leaving a group, even after Escape: `trap`;
 * - neither Enter nor Space changed anything on the target: `not-operable`.
 * It reads only its observations (what has focus, what changed), never the DOM.
 */
export function createKeyboardPlanner(hints: readonly StepHint[]): PersonaPlanner {
  let index = 0;
  let phase: 'seek' | 'key1' | 'key2' | 'typed' = 'seek';
  let firstKey: 'Enter' | 'Space' = 'Enter';
  let seen: string[] = [];
  let wrapped = false;
  let nullStreak = 0;
  let escapeTried = false;
  let actedOn: string | undefined;

  const advance = () => {
    index++;
    phase = 'seek';
    seen = [];
    wrapped = false;
    nullStreak = 0;
    escapeTried = false;
  };

  const step = (obs: KeyboardObservation): PersonaAction => {
    if (index >= hints.length) return { type: 'done', reason: 'all steps completed' };
    const hint = hints[index]!;
    const label = describeHint(hint);

    if (phase === 'typed') {
      advance();
      return step(obs);
    }
    if (phase === 'key1' || phase === 'key2') {
      if (obs.changed) {
        advance();
        return step(obs);
      }
      if (phase === 'key1') {
        phase = 'key2';
        const key = firstKey === 'Enter' ? 'Space' : 'Enter';
        return { type: 'press', key, reason: `${firstKey} did nothing on ${label}; try ${key}` };
      }
      return {
        type: 'give_up',
        cause: 'not-operable',
        reason: `${label} has focus but neither Enter nor Space did anything.`,
        ...(actedOn ? { ref: actedOn } : {}),
      };
    }

    const f = obs.focused;
    if (f && nameMatches(f.name, hint)) {
      actedOn = f.selector;
      if (hint.action === 'type') {
        phase = 'typed';
        return { type: 'type', text: hint.text ?? '', reason: `type into ${label}` };
      }
      firstKey = SPACE_FIRST_ROLES.has(f.role) ? 'Space' : 'Enter';
      phase = 'key1';
      return { type: 'press', key: firstKey, reason: `activate ${label}` };
    }

    if (!f) {
      if (seen.length > 0) wrapped = true;
      nullStreak++;
      if (nullStreak >= 2 && seen.length === 0) {
        return {
          type: 'give_up',
          cause: 'unreachable',
          reason: `Tab never moved focus onto anything on the page, so ${label} can't be reached.`,
        };
      }
    } else {
      nullStreak = 0;
      if (seen.includes(f.selector)) {
        if (wrapped) {
          return {
            type: 'give_up',
            cause: 'unreachable',
            reason: `Tab went through all ${seen.length} focus stops on the page and never reached ${label}.`,
          };
        }
        if (!escapeTried) {
          escapeTried = true;
          seen = [];
          return {
            type: 'press',
            key: 'Escape',
            reason: 'focus is going in circles; try Escape to get out',
          };
        }
        return {
          type: 'give_up',
          cause: 'trap',
          reason: `Focus keeps circling through ${seen.length} stops and never leaves them, even after Escape; ${label} can't be reached.`,
          ref: f.selector,
        };
      }
      seen.push(f.selector);
    }
    return { type: 'press', key: 'Tab', reason: `look for ${label}` };
  };

  return {
    kind: 'deterministic',
    hintIndex: () => Math.min(index, hints.length - 1),
    async next(obs: Observation) {
      if (obs.constraint !== 'keyboard-only') {
        throw new Error('keyboard planner got a non-keyboard observation');
      }
      return step(obs);
    },
  };
}

/** Screen-reader candidates for a hint: matching role (or any operable node) and name. */
export function findSrTarget(nodes: readonly SrNode[], hint: StepHint): SrNode | undefined {
  return nodes.find(
    (n) =>
      (hint.role ? rolesMatch(n.role, hint.role) : INTERACTIVE_ROLES.has(n.role) || n.focusable) &&
      nameMatches(n.name, hint),
  );
}

/**
 * Deterministic screen-reader planner. It perceives the page only through the accessibility
 * tree snapshot: for each hint it looks the control up by role and name (like a screen reader's
 * elements list), then activates it or types into it. It gives up when:
 * - nodes with the hint's role exist but have no accessible name: `unnamed`;
 * - nothing in the tree matches: `not-exposed`;
 * - activating the node changed nothing: `not-operable`.
 */
export function createScreenReaderPlanner(hints: readonly StepHint[]): PersonaPlanner {
  let index = 0;
  let phase: 'find' | 'activated' | 'typed' = 'find';
  let actedOn: string | undefined;

  const step = (obs: SrObservation): PersonaAction => {
    if (index >= hints.length) return { type: 'done', reason: 'all steps completed' };
    const hint = hints[index]!;
    const label = describeHint(hint);
    if (phase === 'typed' || (phase === 'activated' && obs.changed)) {
      index++;
      phase = 'find';
      return step(obs);
    }
    if (phase === 'activated') {
      return {
        type: 'give_up',
        cause: 'not-operable',
        reason: `Activating ${label} changed nothing.`,
        ...(actedOn ? { ref: actedOn } : {}),
      };
    }
    const target = findSrTarget(obs.nodes, hint);
    if (target) {
      actedOn = target.ref;
      if (hint.action === 'type') {
        phase = 'typed';
        return {
          type: 'type',
          ref: target.ref,
          text: hint.text ?? '',
          reason: `type into ${label}`,
        };
      }
      phase = 'activated';
      return { type: 'activate', ref: target.ref, reason: `activate ${label}` };
    }
    const unnamed = hint.role
      ? obs.nodes.filter((n) => rolesMatch(n.role, hint.role!) && !n.name.trim())
      : [];
    if (unnamed.length) {
      return {
        type: 'give_up',
        cause: 'unnamed',
        reason: `No ${label} in the accessibility tree; ${unnamed.length} ${hint.role} control(s) have no accessible name, so a screen reader user can't tell which one it is.`,
        ref: unnamed[0]!.ref,
      };
    }
    return {
      type: 'give_up',
      cause: 'not-exposed',
      reason: `Nothing in the accessibility tree matches ${label}.`,
    };
  };

  return {
    kind: 'deterministic',
    hintIndex: () => Math.min(index, hints.length - 1),
    async next(obs: Observation) {
      if (obs.constraint !== 'screen-reader') {
        throw new Error('screen-reader planner got a non-screen-reader observation');
      }
      return step(obs);
    },
  };
}
