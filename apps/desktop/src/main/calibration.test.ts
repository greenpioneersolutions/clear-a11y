import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CalibrationAnswer } from '../shared/api-types.js';
import {
  createJsonCalibrationStore,
  createSqliteCalibrationStore,
  toCalibrationExport,
  type CalibrationStore,
} from './calibration.js';

const answer = (over: Partial<CalibrationAnswer> = {}): CalibrationAnswer => ({
  findingId: 'f1',
  scanId: '00000000-0000-4000-8000-000000000000',
  ruleId: 'keyboard/skip-link-missing',
  engine: 'engine-keyboard',
  wcag: ['2.4.1'],
  tierAtTime: 'needs-review',
  confidence: 0.5,
  answer: 'yes',
  answeredAt: '2026-10-31T10:00:00.000Z',
  appVersion: '0.0.0',
  ...over,
});

const stores: Record<string, (dir: string) => Promise<CalibrationStore>> = {
  sqlite: (dir) => createSqliteCalibrationStore(join(dir, 'clear-a11y.db')),
  json: async (dir) => createJsonCalibrationStore(join(dir, 'calibration.json')),
};

describe.each(Object.keys(stores))('%s calibration store', (kind) => {
  it('saves, replaces by finding id, lists in answer order and persists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-cal-'));
    const open = stores[kind] as (dir: string) => Promise<CalibrationStore>;
    const store = await open(dir);
    await store.save(answer());
    await store.save(
      answer({ findingId: 'f2', answer: 'skip', answeredAt: '2026-10-31T10:01:00.000Z' }),
    );
    await store.save(
      answer({ answer: 'no', note: 'Footer has one.', answeredAt: '2026-10-31T10:02:00.000Z' }),
    );
    expect((await store.get('f1'))?.answer).toBe('no');
    expect((await store.list()).map((a) => a.findingId)).toEqual(['f2', 'f1']);
    await store.close();

    const reopened = await open(dir);
    expect(await reopened.list()).toEqual([
      answer({ findingId: 'f2', answer: 'skip', answeredAt: '2026-10-31T10:01:00.000Z' }),
      answer({ answer: 'no', note: 'Footer has one.', answeredAt: '2026-10-31T10:02:00.000Z' }),
    ]);
    await expect(reopened.save(answer({ answer: 'maybe' as 'yes' }))).rejects.toThrow();
    await reopened.close();
  });
});

describe('calibration_answers table', () => {
  it('has the documented columns', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-cal-'));
    const path = join(dir, 'clear-a11y.db');
    const store = await createSqliteCalibrationStore(path);
    await store.save(answer());
    await store.close();
    const db = new DatabaseSync(path);
    const cols = (
      db.prepare('PRAGMA table_info(calibration_answers)').all() as { name: string }[]
    ).map((c) => c.name);
    db.close();
    expect(cols).toEqual([
      'finding_id',
      'scan_id',
      'rule_id',
      'engine',
      'wcag',
      'tier_at_time',
      'confidence',
      'answer',
      'note',
      'answered_at',
      'app_version',
    ]);
  });
});

describe('toCalibrationExport', () => {
  it('wraps answers in the versioned export format', () => {
    expect(toCalibrationExport([answer()], '1.2.3', new Date('2026-10-31T12:00:00Z'))).toEqual({
      format: 'clear-a11y-calibration',
      version: 1,
      exportedAt: '2026-10-31T12:00:00.000Z',
      appVersion: '1.2.3',
      answers: [answer()],
    });
  });
});
