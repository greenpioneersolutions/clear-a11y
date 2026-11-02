import { AiConfigError } from '../errors.js';
import { hasPersonaTasks, matchesUrl, parsePersonaOptions } from './config.js';
import { describeHint, nameMatches, rolesMatch } from './match.js';

const task = {
  id: 'pay',
  goal: 'Pay for the order',
  match: 'checkout',
  constraint: 'keyboard-only',
  steps: [{ role: 'button', name: 'Pay now' }],
  success: { text: 'Payment complete' },
} as const;

describe('persona config', () => {
  it('fills defaults', () => {
    const o = parsePersonaOptions({ tasks: [task] });
    expect(o.planner).toBe('deterministic');
    expect(o.tasks[0]).toMatchObject({ maxSteps: 40, steps: [{ action: 'activate' }] });
    expect(parsePersonaOptions(undefined).tasks).toEqual([]);
  });

  it('rejects invalid tasks with readable messages', () => {
    const bad = (t: Record<string, unknown>) => () =>
      parsePersonaOptions({ tasks: [{ ...task, ...t }] });
    expect(bad({ constraint: 'mouse' })).toThrow(AiConfigError);
    expect(bad({ success: {} })).toThrow(/success needs selector, text or urlIncludes/);
    expect(bad({ steps: [] })).toThrow(
      /personas\.tasks\.0\.steps: a task run by the deterministic planner/,
    );
    expect(bad({ steps: [{ role: 'button' }] })).toThrow(/a step needs name or namePattern/);
    expect(bad({ steps: [{ name: 'Email', action: 'type' }] })).toThrow(/a "type" step needs text/);
    expect(bad({ steps: [{ namePattern: '(' }] })).toThrow(/valid regular expression/);
    expect(bad({ maxSteps: 0 })).toThrow(/maxSteps/);
    expect(bad({ extra: true })).toThrow(/extra/);
    expect(() => parsePersonaOptions({ tasks: [task, task] })).toThrow(/duplicate task id "pay"/);
  });

  it('lets AI-planned tasks omit steps', () => {
    expect(() =>
      parsePersonaOptions({ tasks: [{ ...task, steps: [], planner: 'ai' }] }),
    ).not.toThrow();
    expect(() =>
      parsePersonaOptions({ planner: 'ai', tasks: [{ ...task, steps: [] }] }),
    ).not.toThrow();
  });

  it('detects whether any task is configured', () => {
    expect(hasPersonaTasks({ tasks: [task] })).toBe(true);
    expect(hasPersonaTasks({ tasks: [] })).toBe(false);
    expect(hasPersonaTasks({})).toBe(false);
    expect(hasPersonaTasks(undefined)).toBe(false);
  });

  it('matches URLs by substring or glob', () => {
    const url = 'http://127.0.0.1:4173/persona/checkout-keyboard-ok.html';
    expect(matchesUrl('checkout-keyboard', url)).toBe(true);
    expect(matchesUrl('signup', url)).toBe(false);
    expect(matchesUrl('persona/checkout-keyboard-*.html', url)).toBe(true);
    expect(matchesUrl('persona/checkout-keyboard-*.html', `${url}?x=1#top`)).toBe(true);
    expect(matchesUrl('persona/signup-*.html', url)).toBe(false);
    expect(matchesUrl('http://127.0.0.1:*/persona/*', url)).toBe(true);
    expect(matchesUrl('*.htm', url)).toBe(false);
  });
});

describe('hint matching', () => {
  it('matches names case- and whitespace-insensitively, by substring or pattern', () => {
    expect(nameMatches('  Pay   NOW ', { name: 'pay now' })).toBe(true);
    expect(nameMatches('I accept the terms and conditions', { name: 'I accept the terms' })).toBe(
      true,
    );
    expect(nameMatches('Add to cart', { namePattern: 'add to (basket|cart)' })).toBe(true);
    expect(nameMatches('Add to wishlist', { namePattern: 'add to (basket|cart)' })).toBe(false);
    expect(nameMatches('', { name: 'x' })).toBe(false);
    expect(nameMatches('anything', {})).toBe(false);
  });

  it('treats related roles as the same control', () => {
    expect(rolesMatch('searchbox', 'textbox')).toBe(true);
    expect(rolesMatch('switch', 'checkbox')).toBe(true);
    expect(rolesMatch('link', 'button')).toBe(false);
    expect(describeHint({ role: 'button', name: 'Pay now' })).toBe('button "Pay now"');
    expect(describeHint({ namePattern: 'pay' })).toBe('"/pay/i"');
  });
});
