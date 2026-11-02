import {
  dialogInitialFocusRule,
  evaluateDialog,
  type DialogObservation,
} from './dialog-initial-focus.js';

const good: DialogObservation = {
  dialog: '#dlg',
  trigger: '#open',
  opened: true,
  focusInside: true,
  focused: '#first-field',
  name: 'Settings',
};

describe('widgets/dialog-initial-focus', () => {
  it('has rule metadata', () => {
    expect(dialogInitialFocusRule.id).toBe('widgets/dialog-initial-focus');
    expect(dialogInitialFocusRule.wcag).toEqual(['2.4.3', '4.1.2']);
  });

  it('does not flag a named dialog that takes focus', () => {
    expect(evaluateDialog(good)).toEqual([]);
  });

  it('flags focus left behind the dialog as likely 2.4.3', () => {
    const [p] = evaluateDialog({ ...good, focusInside: false, focused: '#open' });
    expect(p).toMatchObject({ tier: 'likely', wcag: ['2.4.3'], selector: '#dlg' });
    expect(p?.message).toContain('#open');
  });

  it('flags a dialog without a name as a 4.1.2 violation', () => {
    const [p] = evaluateDialog({ ...good, name: '  ' });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['4.1.2'] });
  });

  it('ignores a dialog that did not open', () => {
    expect(evaluateDialog({ ...good, opened: false, focusInside: false, name: '' })).toEqual([]);
  });
});
