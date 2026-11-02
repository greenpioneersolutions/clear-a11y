import { summarize, type ScanResult } from '@clear-a11y/core';
import { newScanId, SCAN_ID_PATTERN, ScanStore, type StoredScan } from './store.js';

const result: ScanResult = {
  schemaVersion: 1,
  tool: { name: 'clear-a11y', version: '0.0.0' },
  startedAt: '',
  finishedAt: '',
  targets: [],
  pages: [],
  findings: [],
  errors: [],
  summary: summarize([]),
};
const scan = (id: string): StoredScan => ({
  id,
  kind: 'url',
  createdAt: '',
  result,
  dir: `/tmp/${id}`,
  notices: [],
});

describe('ScanStore', () => {
  it('evicts the least recently used scan', () => {
    const store = new ScanStore(2);
    store.add(scan('a'));
    store.add(scan('b'));
    expect(store.get('a')?.id).toBe('a'); // touch a: b is now oldest
    const evicted = store.add(scan('c'));
    expect(evicted.map((s) => s.id)).toEqual(['b']);
    expect(store.get('b')).toBeUndefined();
    expect(store.list().map((s) => s.id)).toEqual(['c', 'a']);
    expect(store.size).toBe(2);
  });

  it('replaces a scan with the same id', () => {
    const store = new ScanStore(3);
    store.add(scan('a'));
    store.add({ ...scan('a'), notices: ['new'] });
    expect(store.size).toBe(1);
    expect(store.get('a')?.notices).toEqual(['new']);
  });

  it('rejects a bad capacity', () => {
    expect(() => new ScanStore(0)).toThrow();
  });
});

describe('newScanId', () => {
  it('is unique and directory-safe', () => {
    const a = newScanId();
    const b = newScanId();
    expect(a).not.toBe(b);
    expect(a).toMatch(SCAN_ID_PATTERN);
  });
});
