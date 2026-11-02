import { OWN_STATE_ROLES, REQUIRED_STATES, requiredStateFor } from './required-states.js';

describe('required states', () => {
  it('knows the state each role needs', () => {
    expect(requiredStateFor('checkbox')?.attributes).toEqual(['aria-checked']);
    expect(requiredStateFor('combobox')?.attributes).toEqual(['aria-expanded']);
    expect(requiredStateFor('tab')?.attributes).toEqual(['aria-selected']);
    expect(requiredStateFor('button')).toBeUndefined();
  });

  it('leaves roles that axe already checks to axe', () => {
    expect(OWN_STATE_ROLES).toEqual(['tab']);
    expect(REQUIRED_STATES.filter((r) => r.coveredByAxe).map((r) => r.role)).toContain('checkbox');
  });
});
