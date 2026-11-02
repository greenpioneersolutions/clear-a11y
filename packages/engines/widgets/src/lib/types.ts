import type { Tier } from '@clear-a11y/core';

export const WIDGET_KINDS = [
  'tabs',
  'menu-button',
  'menubar',
  'combobox',
  'listbox',
  'dialog',
  'disclosure',
  'grid',
] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

/** A widget found on the page, addressed by stable selectors so it survives a reload. */
export interface Widget {
  kind: WidgetKind;
  /** The widget root (tablist, menu button, combobox, listbox, grid, disclosure button, dialog). */
  selector: string;
  /** Related element: popup of a menu button or combobox, region of a disclosure, dialog of a trigger. */
  related?: string;
  /** For dialogs: the control that opens it. */
  trigger?: string;
}

/** One key press in a keyboard script and where focus ended up afterwards. */
export interface Step {
  /** Playwright key name ("ArrowRight", "Enter", " "...), or "start" for the initial focus. */
  key: string;
  /** Selector of the focused element after the key, or null when focus is on <body>. */
  focused: string | null;
}

/**
 * A problem a contract evaluator found. The engine groups problems by rule and target and turns
 * each group into one Finding (the most severe tier wins).
 */
export interface Problem {
  ruleId: string;
  wcag: string[];
  tier: Tier;
  confidence: number;
  selector: string;
  message: string;
  /** Required when tier is needs-review: the yes/no question a human answers. */
  question?: string;
  data?: Record<string, unknown>;
}
