import type { Page, PageContext, StateMeta } from '@clear-a11y/browser';
import { discoverStates } from '@clear-a11y/engine-states';

export interface DiscoveredState {
  /** e.g. "dialog:open#settings-dialog". */
  id: string;
  meta: StateMeta;
  /** Human description for reports and logs. */
  label?: string;
  /** True when the replayed state really is open. States that fail verification are skipped. */
  verify?: (page: Page) => Promise<boolean>;
}

/** Finds the hidden states of a page (menus, dialogs, error states) that engines should also see. */
export type StateDiscoverer = (ctx: PageContext) => Promise<DiscoveredState[]>;

export const noStates: StateDiscoverer = async () => [];

/** The default discoverer: engine-states' explorer, mapped to the runner's state contract. */
export const exploreStates: StateDiscoverer = async (ctx) =>
  (await discoverStates(ctx)).map((d) => ({
    id: d.id,
    label: d.label,
    meta: { kind: d.kind, triggerSelector: d.trigger, replay: (page: Page) => d.open(page) },
    verify: (page: Page) => d.verify(page),
  }));
