import { useRef, useState, type KeyboardEvent } from 'react';
import type { Tab } from './Tabs';

/**
 * Correct pattern (ARIA Authoring Practices "Tabs with Automatic Activation"): roving tabindex,
 * Left/Right Arrow, Home and End move between tabs.
 */
export function TabsOk({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [selected, setSelected] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (i: number) => {
    const next = (i + tabs.length) % tabs.length;
    setSelected(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={i === selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} tabIndex={0} hidden={i !== selected}>
          <p>{t.content}</p>
        </div>
      ))}
    </div>
  );
}
