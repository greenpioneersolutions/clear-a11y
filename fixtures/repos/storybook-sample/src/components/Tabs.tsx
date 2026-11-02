import { useState } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: string;
}

/**
 * Seeded barrier: roving tabindex without the arrow-key handler. Only the selected tab is
 * focusable, so keyboard users can never reach the other tabs (2.1.1).
 */
export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [selected, setSelected] = useState(tabs[0]?.id);
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === selected ? 0 : -1}
            onClick={() => setSelected(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== selected}>
          <p>{t.content}</p>
        </div>
      ))}
    </div>
  );
}
