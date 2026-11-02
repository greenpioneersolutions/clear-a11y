import type { ClearA11yConfig, Evidence, Finding, Rect, Viewport } from '@clear-a11y/core';
import type { Page } from 'playwright';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** Stores evidence files (screenshot crops) and returns a path relative to the report directory. */
export interface ArtifactSink {
  save(name: string, data: Uint8Array, ext?: string): Promise<string>;
}

/** How the current state was reached, so engines can re-open it (focus return, announcements). */
export interface StateMeta {
  /** "default", "dialog", "menu", "disclosure", "tabs", "tooltip", "form-empty", "form-invalid", ... */
  kind: string;
  /** Selector of the control that opens the state, when there is one. */
  triggerSelector?: string;
  /** Re-creates the state on a freshly loaded page. */
  replay?: (page: Page) => Promise<void>;
}

/**
 * A verified pass an engine reports through `ctx.recordPass` (ADR 0003): the element was measured
 * for these success criteria and is compliant. The runner adds the engine name, page, state and
 * viewport. Record a pass only when the measurement covers the whole SC for that element.
 */
export interface PassInput {
  /** The rule that measured it, e.g. "visual/contrast-over-background". */
  ruleId: string;
  wcag: string[];
  /** Built with `selectorFor` / `window.__clearA11y.selector`, like finding selectors. */
  selector: string;
  /** The measurement (ratios, sample counts), kept with any finding the pass resolves. */
  evidence?: Evidence;
}

/** Everything an engine needs to analyze one page in one state at one viewport. */
export interface PageContext {
  /** Live page, already loaded and in the target state. */
  page: Page;
  url: string;
  /** "default", or a state id from the state explorer such as "dialog:open#settings". */
  state: string;
  stateMeta?: StateMeta;
  viewport: Viewport;
  config: ClearA11yConfig;
  artifacts: ArtifactSink;
  log: Logger;
  /**
   * Reports a verified pass (ADR 0003). Optional: absent when the caller doesn't collect passes
   * (unit tests, other hosts), so engines call it as `ctx.recordPass?.(...)`.
   */
  recordPass?: (pass: PassInput) => void;
}

export interface Engine {
  /** "engine-<layer>", e.g. "engine-keyboard". */
  name: string;
  /**
   * Set to false when the engine only reads the page. The runner runs read-only engines on a
   * shared page load and gives every other engine a fresh load of the same state.
   */
  mutatesPage?: boolean;
  run(ctx: PageContext): Promise<Finding[]>;
}

/** Helpers installed in the page as `window.__clearA11y` by `ensureHelpers(page)`. */
export interface PageHelpers {
  selector(el: Element): string;
  isVisible(el: Element): boolean;
  isFocusable(el: Element): boolean;
  rect(el: Element): Rect;
  snippet(el: Element, max?: number): string;
}

declare global {
  interface Window {
    __clearA11y?: PageHelpers;
  }
}
