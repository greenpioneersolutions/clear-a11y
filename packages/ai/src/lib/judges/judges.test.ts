import { fileNameOf } from './alt-text.js';
import { contrastRatio, pickColorOnlyCandidates, type RawColorItem } from './color-only.js';
import { pickDescriptiveCandidates, type RawHeadingOrLabel } from './descriptive.js';
import { dedupeErrors, isFormInvalidState, type RawError } from './error-clarity.js';
import { analyzePath, isBackwardMove, sequentialOrder, type PathStop } from './focus-order.js';
import { JUDGES, rules } from './index.js';
import { isAmbiguousLabelInName } from './label-in-name.js';
import {
  hrefForModel,
  isGenericLinkText,
  pickLinkCandidates,
  type RawLink,
} from './link-purpose.js';
import { isDefaultState } from './types.js';

describe('judge registry', () => {
  it('has the seven judges with unique ids, WCAG and likely rule metadata', () => {
    expect(JUDGES.map((j) => j.id)).toEqual([
      'alt-text',
      'label-in-name',
      'link-purpose',
      'descriptive-headings-labels',
      'error-clarity',
      'color-only',
      'focus-order',
    ]);
    expect(rules.map((r) => r.wcag[0])).toEqual([
      '1.1.1',
      '2.5.3',
      '2.4.4',
      '2.4.6',
      '3.3.3',
      '1.4.1',
      '2.4.3',
    ]);
    expect(rules.every((r) => r.tier === 'likely' && r.engine.startsWith('ai-'))).toBe(true);
  });

  it('runs error-clarity only in form-invalid states and the rest in the default state', () => {
    const def = { state: 'default', stateMeta: { kind: 'default' } };
    const invalid = { state: 'form-invalid#signup', stateMeta: { kind: 'form-invalid' } };
    expect(isDefaultState(def)).toBe(true);
    expect(isDefaultState(invalid)).toBe(false);
    expect(isFormInvalidState(invalid)).toBe(true);
    expect(isFormInvalidState(def)).toBe(false);
  });
});

describe('alt-text', () => {
  it('extracts file names but not data URIs', () => {
    expect(fileNameOf('https://cdn.test/a/IMG_2041.jpg?w=200#x')).toBe('IMG_2041.jpg');
    expect(fileNameOf('/img/team%20photo.png')).toBe('team photo.png');
    expect(fileNameOf('data:image/svg+xml,%3Csvg%3E')).toBe('');
    expect(fileNameOf('')).toBe('');
  });
});

describe('label-in-name', () => {
  it('sends only the ambiguous cases', () => {
    expect(isAmbiguousLabelInName('×', 'Close dialog')).toBe(true);
    expect(isAmbiguousLabelInName('Qty 2', 'Quantity 2')).toBe(true);
    expect(isAmbiguousLabelInName('Search', 'Search products')).toBe(false); // contains: pass
    expect(isAmbiguousLabelInName('Search', 'Find products')).toBe(false); // no overlap: engine-at
    expect(isAmbiguousLabelInName('', 'Close')).toBe(false); // no visible label
  });
});

describe('link-purpose', () => {
  const link = (text: string, href: string, selector = `#${text.replace(/\W/g, '')}`): RawLink => ({
    selector,
    text,
    href,
    context: '',
    heading: '',
    describedBy: '',
    title: '',
    html: '',
  });

  it('recognizes generic link text', () => {
    expect(isGenericLinkText('Click here')).toBe(true);
    expect(isGenericLinkText('Read more…')).toBe(true);
    expect(isGenericLinkText('Read the accessibility statement')).toBe(false);
  });

  it('ranks generic and duplicate-text links first and skips clear ones', () => {
    const picked = pickLinkCandidates(
      [
        link('Shipping policy', '/shipping'),
        link('Click here', '/a', '#l1'),
        link('Click here', '/b', '#l2'),
        link('Docs', '/docs'),
        link('Docs', '/docs/v2', '#docs2'),
      ],
      10,
    );
    expect(picked.map((p) => p.link.selector)).toEqual(['#l1', '#l2', '#Docs', '#docs2']);
    expect(picked[0]!.sameTextOtherHrefs).toBe(1);
    expect(pickLinkCandidates([link('Click here', '/a')], 0)).toEqual([]);
  });

  it('drops query strings from destinations', () => {
    expect(hrefForModel('http://127.0.0.1/a/b?token=secret#top', 'http://127.0.0.1/x')).toBe(
      '/a/b#top',
    );
    expect(hrefForModel('https://other.test/p?q=1', 'http://127.0.0.1/x')).toBe(
      'https://other.test/p',
    );
  });
});

describe('descriptive headings and labels', () => {
  const item = (text: string, kind: RawHeadingOrLabel['kind'] = 'heading'): RawHeadingOrLabel => ({
    selector: `#${text.replace(/\W/g, '')}`,
    kind,
    text,
    following: '',
    html: '',
  });
  it('sends vague, numeric and duplicated texts, most suspicious first', () => {
    const picked = pickDescriptiveCandidates(
      [
        item('Delivery address'),
        item('Details'),
        item('Details'),
        item('2'),
        item('Choose a plan'),
        item('Info', 'label'),
      ],
      10,
    );
    expect(picked.map((p) => p.text)).toEqual(['Details', 'Details', '2', 'Info']);
  });
});

describe('error-clarity', () => {
  it('dedupes by element and drops empty messages', () => {
    const e = (selector: string, errorText: string): RawError => ({
      selector,
      errorText,
      fieldLabel: '',
      fieldType: '',
      required: false,
      constraints: {},
      formHeading: '',
      html: '',
    });
    expect(
      dedupeErrors([e('#a', 'Error 42'), e('#a', 'Error 42'), e('#b', ''), e('#c', 'x')], 5),
    ).toHaveLength(2);
  });
});

describe('color-only', () => {
  it('computes WCAG contrast between computed colors', () => {
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe(21);
    expect(contrastRatio('rgb(26, 79, 139)', 'rgb(26, 26, 26)')).toBeLessThan(3);
    expect(contrastRatio('red', 'blue')).toBeUndefined();
  });

  it('keeps only items with no non-color cue', () => {
    const base: RawColorItem = {
      selector: '#a',
      kind: 'inline-link',
      text: 'terms',
      color: 'rgb(0, 0, 200)',
      compareColor: 'rgb(0, 0, 0)',
      cues: [],
      context: '',
      html: '',
    };
    const picked = pickColorOnlyCandidates(
      [
        base,
        { ...base, selector: '#b', cues: ['underline'] },
        { ...base, selector: '#c', color: 'rgb(0, 0, 0)' },
      ],
      5,
    );
    expect(picked.map((p) => p.selector)).toEqual(['#a']);
  });
});

describe('focus-order', () => {
  const stop = (index: number, x: number, y: number): PathStop => ({
    index,
    selector: `#s${index}`,
    name: '',
    role: 'input',
    rect: { x, y, width: 200, height: 30 },
  });

  it('detects backward moves in reading order', () => {
    expect(isBackwardMove(stop(0, 0, 100).rect, stop(1, 0, 10).rect)).toBe(true); // up
    expect(isBackwardMove(stop(0, 400, 100).rect, stop(1, 0, 100).rect)).toBe(true); // left, same row
    expect(isBackwardMove(stop(0, 0, 100).rect, stop(1, 0, 200).rect)).toBe(false);
  });

  it('treats single-column forward paths as linear', () => {
    expect(analyzePath([stop(0, 0, 0), stop(1, 0, 50), stop(2, 0, 100)], 1280).nonLinear).toBe(
      false,
    );
    const back = analyzePath([stop(0, 0, 0), stop(1, 0, 100), stop(2, 0, 50)], 1280);
    expect(back).toMatchObject({ nonLinear: true, backward: [2] });
    const columns = analyzePath(
      [stop(0, 0, 0), stop(1, 700, 50), stop(2, 0, 100), stop(3, 700, 150)],
      1280,
    );
    expect(columns.columnSwitches).toBe(3);
    expect(columns.nonLinear).toBe(true);
  });

  it('orders positive tabindex first, then DOM order, and skips negative tabindex', () => {
    const order = sequentialOrder([
      { domIndex: 0, tabIndex: 0 },
      { domIndex: 1, tabIndex: 2 },
      { domIndex: 2, tabIndex: -1 },
      { domIndex: 3, tabIndex: 1 },
      { domIndex: 4, tabIndex: 0 },
    ]);
    expect(order.map((o) => o.domIndex)).toEqual([3, 1, 0, 4]);
  });
});
