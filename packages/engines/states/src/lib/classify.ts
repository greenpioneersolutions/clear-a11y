import type { StateKind } from './descriptor.js';

export type CandidateReason = 'toggle' | 'summary' | 'tab' | 'button' | 'tooltip';

/** A control the explorer may activate (collected in the page). */
export interface Candidate {
  selector: string;
  reason: CandidateReason;
  /** Approximate accessible name. */
  name: string;
  tag: string;
  role: string;
  id: string;
  expanded?: string;
  controls?: string;
  haspopup?: string;
  popovertarget?: string;
  /** Inside h1-h6 (accordion headers). */
  inHeading: boolean;
  /** Buttons, links and role=button can also be clicked when hover/focus reveals nothing. */
  clickable: boolean;
}

/** One revealed subtree root (described in the page after an action). */
export interface Revealed {
  selector: string;
  id: string;
  tag: string;
  role: string;
  textLength: number;
  links: number;
  interactive: number;
  /** The root is or contains a dialog (`dialog[open]`, role=dialog/alertdialog). */
  dialog: boolean;
  /** Id of that dialog, when it has one. */
  dialogId: string;
  /** The root is or contains role=menu/menubar/listbox. */
  menu: boolean;
  /** The root is or contains role=tabpanel. */
  tabpanel: boolean;
  /** The root is or contains role=tooltip. */
  tooltip: boolean;
  /** The root has the `popover` attribute. */
  popover: boolean;
  /** The root is a nav or a list (or contains one). */
  navLike: boolean;
  /** The root is inside an open `<details>`. */
  inDetails: boolean;
}

export type ActionType = 'click' | 'hover' | 'focus';

export interface Classification {
  kind: StateKind;
  /** What the state id names: the revealed content's id, else the trigger. */
  target: string;
}

const MENU_POPUPS = new Set(['menu', 'true', 'listbox']);

/** Decides what kind of state an action revealed. Pure. */
export function classifyState(
  candidate: Candidate,
  action: ActionType,
  revealed: readonly Revealed[],
): Classification {
  const any = (p: (r: Revealed) => boolean) => revealed.some(p);
  const links = revealed.reduce((n, r) => n + r.links, 0);
  const target = (preferred?: string) =>
    preferred ||
    (candidate.controls && revealed.some((r) => r.id === candidate.controls)
      ? candidate.controls
      : '') ||
    revealed.find((r) => r.id)?.id ||
    candidate.id ||
    candidate.name ||
    candidate.selector;

  const dialog = revealed.find((r) => r.dialog);
  if (dialog) return { kind: 'dialog', target: target(dialog.dialogId) };
  if (action !== 'click') {
    const menu = any((r) => r.menu) || (links >= 2 && any((r) => r.navLike));
    return { kind: menu ? 'menu' : 'tooltip', target: target() };
  }
  if (candidate.reason === 'tab' || any((r) => r.tabpanel))
    return { kind: 'tab', target: target() };
  if (candidate.popovertarget || any((r) => r.popover)) {
    return { kind: any((r) => r.menu) ? 'menu' : 'popover', target: target() };
  }
  if (candidate.reason === 'summary' || any((r) => r.inDetails)) {
    // A summary's content has no id of its own; name the state after its <details>.
    return {
      kind: 'disclosure',
      target: target(candidate.reason === 'summary' ? candidate.controls : undefined),
    };
  }
  if (any((r) => r.menu) || (candidate.haspopup && MENU_POPUPS.has(candidate.haspopup))) {
    return { kind: 'menu', target: target() };
  }
  if (any((r) => r.tooltip)) return { kind: 'tooltip', target: target() };
  if (candidate.inHeading) return { kind: 'accordion', target: target() };
  if (links >= 2 && any((r) => r.navLike)) return { kind: 'menu', target: target() };
  return { kind: 'disclosure', target: target() };
}

/** Drops revealed roots that carry no content (empty boxes, spacers). Pure. */
export function significant(revealed: readonly Revealed[]): Revealed[] {
  return revealed.filter((r) => r.textLength > 0 || r.interactive > 0 || r.dialog);
}
