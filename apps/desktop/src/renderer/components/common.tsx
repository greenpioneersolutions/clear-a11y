import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { ScanRecord } from '../../shared/api-types.js';
import { formatDate } from '../api.js';

/** The view's single h1. `tabIndex=-1` so navigation can move focus to it. */
export function ViewHeading({ children }: { children: ComponentChildren }) {
  return (
    <h1 id="view-heading" tabIndex={-1}>
      {children}
    </h1>
  );
}

/** An error message announced right away (role="alert"). */
export function ErrorText({ message, id }: { message?: string; id?: string }) {
  return (
    <p class="error" role="alert" id={id}>
      {message || null}
    </p>
  );
}

export function Notice({
  title,
  children,
  tone = 'info',
}: {
  title: string;
  children: ComponentChildren;
  tone?: 'info' | 'warning';
}) {
  return (
    <section class={`notice notice-${tone}`} aria-label={title}>
      <h2 class="notice-title">{title}</h2>
      {children}
    </section>
  );
}

export function scanLabel(scan: ScanRecord): string {
  return `${scan.label} (${formatDate(scan.finishedAt ?? scan.createdAt)})`;
}

/** Picks one of the finished scans for the report, focus path and review views. */
export function ScanPicker({
  scans,
  value,
  onChange,
  id,
}: {
  scans: ScanRecord[];
  value: string | undefined;
  onChange: (id: string) => void;
  id: string;
}) {
  const finished = scans.filter((s) => s.status === 'succeeded');
  if (!finished.length) return null;
  return (
    <div class="field field-inline">
      <label for={id}>Scan</label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}
      >
        {finished.map((s) => (
          <option key={s.id} value={s.id}>
            {scanLabel(s)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NoScans() {
  return (
    <p>
      No finished scans yet. Add a target on the <a href="#/targets">Targets</a> page and scan it.
    </p>
  );
}

/**
 * A show/hide section: a native button with aria-expanded and aria-controls, and a region that
 * is `hidden` while closed. (Not <details>: engines measure the text inside a closed <details>
 * as if it were laid out; see docs/decisions-pending/S14.md.)
 */
export function Disclosure({
  id,
  summary,
  children,
  heading,
  class: className,
}: {
  id: string;
  summary: ComponentChildren;
  children: ComponentChildren;
  /** Wrap the button in a heading of this level (for lists of findings). */
  heading?: 3;
  class?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <button
      type="button"
      class="disclosure-button"
      aria-expanded={open ? 'true' : 'false'}
      aria-controls={id}
      onClick={() => setOpen(!open)}
    >
      <span class="disclosure-icon" aria-hidden="true" />
      <span class="disclosure-summary">{summary}</span>
    </button>
  );
  return (
    <div class={`disclosure${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      {heading ? <h3 class="disclosure-heading">{button}</h3> : button}
      <div id={id} class="disclosure-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
