import { hrefFor, parseHash, parseLocation } from './router.js';

describe('router', () => {
  const id = '0f8e0a3c-8a8b-4f7c-9a55-3f1e2d4c5b6a';

  it('parses view and scan id from the hash', () => {
    expect(parseHash('')).toEqual({ view: 'targets' });
    expect(parseHash('#/scans')).toEqual({ view: 'scans' });
    expect(parseHash(`#/report/${id}`)).toEqual({ view: 'report', scanId: id });
    expect(parseHash('#/report/<script>')).toEqual({ view: 'report' });
    expect(parseHash('#/nope')).toEqual({ view: 'targets' });
  });

  it('reads ?view= deep links when there is no hash', () => {
    expect(parseLocation({ hash: '', search: `?view=focus&scan=${id}` })).toEqual({
      view: 'focus',
      scanId: id,
    });
    expect(parseLocation({ hash: '#/settings', search: '?view=focus' })).toEqual({
      view: 'settings',
    });
    expect(parseLocation({ hash: '', search: '' })).toEqual({ view: 'targets' });
  });

  it('round-trips', () => {
    expect(parseHash(hrefFor({ view: 'review', scanId: id }))).toEqual({
      view: 'review',
      scanId: id,
    });
  });
});
