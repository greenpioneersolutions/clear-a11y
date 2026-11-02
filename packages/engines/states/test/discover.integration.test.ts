import { fixtureHarness } from '@clear-a11y/test-utils';
import { discoverStates, type StateDescriptor } from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

const discover = async (path: string): Promise<StateDescriptor[]> =>
  discoverStates((await harness.open(path)).ctx);

/** Opens the page fresh, replays the state and checks that it verifies. */
const roundTrip = async (path: string, state: StateDescriptor): Promise<boolean> => {
  const fx = await harness.open(path);
  await state.open(fx.page);
  return state.verify(fx.page);
};

describe('discoverStates (integration)', () => {
  it.each([
    ['states/modal-focus.html', ['dialog:open#settings-dialog']],
    ['states/ok.html', ['dialog:open#settings-dialog', 'form-empty#signup']],
    ['states/menu-hidden-link-no-name.html', ['menu:open#site-menu']],
    [
      'states/expanded-state-mismatch.html',
      ['accordion:open#acc-returns-panel', 'accordion:open#acc-delivery-panel'],
    ],
    ['widgets/tabs-no-arrow-keys.html', ['tab:open#panel-2', 'tab:open#panel-3']],
    ['states/tooltip-contrast.html', ['tooltip:open#ship-tip']],
    // A toggle button inside a heading is the accordion pattern.
    ['at/disclosure-no-state.html', ['accordion:open#faq-shipping-panel']],
    // Email filled with "not-an-email" changes which messages show: a separate state.
    ['states/form-errors.html', ['form-empty#signup', 'form-invalid#signup']],
    ['states/error-not-associated.html', ['form-empty#newsletter', 'form-invalid#newsletter']],
    [
      'states/destructive-button-ok.html',
      ['accordion:open#plan-details', 'disclosure:open#name-help'],
    ],
    ['blank.html', []],
  ] as const)('%s: finds %j, each replayable from a fresh page', async (path, ids) => {
    const states = await discover(path);
    expect(states.map((s) => s.id)).toEqual(ids);
    for (const state of states) {
      expect(await roundTrip(path, state), state.id).toBe(true);
    }
  });

  it('describes how each state was reached', async () => {
    const [dialog] = await discover('states/modal-focus.html');
    expect(dialog).toMatchObject({
      kind: 'dialog',
      trigger: '#open-settings',
      action: { type: 'click', selector: '#open-settings' },
      content: ['#backdrop'],
    });
    expect(dialog?.label).toContain('Open settings');
    const [tooltip] = await discover('states/tooltip-contrast.html');
    expect(tooltip).toMatchObject({ kind: 'tooltip', action: { type: 'hover' } });
    const forms = await discover('states/error-not-associated.html');
    expect(forms[1]?.action).toEqual({
      type: 'submit',
      form: '#newsletter',
      submit: '#newsletter > button',
      fill: { '#news-email': 'not-an-email', '#news-phone': '!' },
    });
  });

  it('verify is false on a page where the state is not open', async () => {
    const [dialog] = await discover('states/modal-focus.html');
    const fx = await harness.open('states/modal-focus.html');
    expect(await (dialog as StateDescriptor).verify(fx.page)).toBe(false);
  });

  it('respects maxStates', async () => {
    const fx = await harness.open('widgets/tabs-no-arrow-keys.html', {
      config: { states: { maxStates: 1 } },
    });
    expect((await discoverStates(fx.ctx)).map((s) => s.id)).toEqual(['tab:open#panel-2']);
  });

  it('only runs on the configured viewports', async () => {
    const fx = await harness.open('states/modal-focus.html', {
      config: { states: { viewports: ['mobile'] } },
    });
    expect(await discoverStates(fx.ctx)).toEqual([]);
  });
});
