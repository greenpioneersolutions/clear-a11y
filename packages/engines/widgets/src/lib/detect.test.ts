import { classifyWidgets, type RawElement } from './detect.js';

const el = (over: Partial<RawElement>): RawElement => ({
  selector: '#x',
  tag: 'div',
  role: null,
  hasPopup: null,
  expanded: null,
  controls: null,
  controlsRole: null,
  visible: true,
  composite: null,
  submits: false,
  controlledByCombobox: false,
  ...over,
});

/** A DOM snapshot of a page with one of each widget (as collectRaw would report it). */
const snapshot: RawElement[] = [
  el({ selector: '#tabs', role: 'tablist' }),
  el({ selector: '#tab-1', tag: 'button', role: 'tab', composite: 'tablist' }),
  el({ selector: '#bar', role: 'menubar' }),
  el({
    selector: '#menu-btn',
    tag: 'button',
    hasPopup: 'menu',
    expanded: 'false',
    controls: '#menu',
    controlsRole: 'menu',
  }),
  el({
    selector: '#cb',
    tag: 'input',
    role: 'combobox',
    expanded: 'false',
    controls: '#cb-list',
    controlsRole: 'listbox',
  }),
  el({
    selector: '#cb-list',
    tag: 'ul',
    role: 'listbox',
    visible: false,
    controlledByCombobox: true,
  }),
  el({ selector: '#sizes', tag: 'ul', role: 'listbox' }),
  el({ selector: '#grid', tag: 'table', role: 'grid' }),
  el({ selector: '#faq', tag: 'button', expanded: 'false', controls: '#faq-panel' }),
  el({
    selector: '#open-dlg',
    tag: 'button',
    hasPopup: 'dialog',
    controls: '#dlg',
    controlsRole: 'dialog',
  }),
  el({ selector: '#dlg', role: 'dialog', visible: false }),
  el({ selector: '#orphan', tag: 'dialog', visible: false }),
  el({ selector: '#plain', tag: 'button' }),
  el({ selector: '#submit', tag: 'button', submits: true }),
  el({ selector: '#link', tag: 'a' }),
];

describe('classifyWidgets', () => {
  const d = classifyWidgets(snapshot);

  it('finds one widget of each kind with its related element', () => {
    expect(d.widgets).toEqual([
      { kind: 'tabs', selector: '#tabs' },
      { kind: 'menubar', selector: '#bar' },
      { kind: 'menu-button', selector: '#menu-btn', related: '#menu' },
      { kind: 'combobox', selector: '#cb', related: '#cb-list' },
      { kind: 'listbox', selector: '#sizes' },
      { kind: 'grid', selector: '#grid' },
      { kind: 'disclosure', selector: '#faq', related: '#faq-panel' },
      { kind: 'dialog', selector: '#dlg', trigger: '#open-dlg' },
    ]);
  });

  it('lists unlinked hidden dialogs and safe buttons to probe them with', () => {
    expect(d.orphanDialogs).toEqual(['#orphan']);
    expect(d.probeButtons).toEqual(['#plain']);
  });

  it('skips hidden widgets, tabs with aria-expanded and probing when no dialog is orphaned', () => {
    const none = classifyWidgets([
      el({ selector: '#hidden-tabs', role: 'tablist', visible: false }),
      el({ selector: '#tab', tag: 'button', role: 'tab', expanded: 'true', composite: 'tablist' }),
      el({ selector: '#in-menu', tag: 'button', expanded: 'false', composite: 'menu' }),
      el({ selector: '#plain', tag: 'button' }),
    ]);
    expect(none).toEqual({ widgets: [], orphanDialogs: [], probeButtons: [] });
  });

  it('does not treat a listbox-popup button as a menu button', () => {
    const d2 = classifyWidgets([
      el({
        selector: '#select',
        tag: 'button',
        hasPopup: 'true',
        expanded: 'false',
        controls: '#opts',
        controlsRole: 'listbox',
      }),
    ]);
    expect(d2.widgets).toEqual([]);
  });
});
