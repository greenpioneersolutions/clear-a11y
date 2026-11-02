import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { CalibrationAnswer, CalibrationExport } from '../shared/api-types.js';
import { readJsonFile, writeJsonFile } from './json-file.js';

/**
 * Calibration data: what a person answered to each needs-review question. Kept only on this
 * machine (SQLite table `calibration_answers` in the app database, or a JSON file when
 * node:sqlite is unavailable) and never sent anywhere. One row per finding id: answering the same
 * question again replaces the earlier answer. Answers never change a finding's tier.
 */
export interface CalibrationStore {
  readonly kind: 'sqlite' | 'json';
  save(answer: CalibrationAnswer): Promise<CalibrationAnswer>;
  get(findingId: string): Promise<CalibrationAnswer | undefined>;
  list(): Promise<CalibrationAnswer[]>;
  close(): Promise<void>;
}

export const CALIBRATION_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS calibration_answers (
  finding_id   TEXT PRIMARY KEY,
  scan_id      TEXT NOT NULL,
  rule_id      TEXT NOT NULL,
  engine       TEXT NOT NULL,
  wcag         TEXT NOT NULL,
  tier_at_time TEXT NOT NULL CHECK (tier_at_time IN ('violation', 'likely', 'needs-review')),
  confidence   REAL NOT NULL,
  answer       TEXT NOT NULL CHECK (answer IN ('yes', 'no', 'skip')),
  note         TEXT,
  answered_at  TEXT NOT NULL,
  app_version  TEXT NOT NULL
)`;

export const CalibrationAnswerSchema = z.object({
  findingId: z.string().min(1),
  scanId: z.string(),
  ruleId: z.string().min(1),
  engine: z.string().min(1),
  wcag: z.array(z.string()),
  tierAtTime: z.enum(['violation', 'likely', 'needs-review']),
  confidence: z.number().min(0).max(1),
  answer: z.enum(['yes', 'no', 'skip']),
  note: z.string().optional(),
  answeredAt: z.string(),
  appVersion: z.string(),
});

interface Row {
  finding_id: string;
  scan_id: string;
  rule_id: string;
  engine: string;
  wcag: string;
  tier_at_time: string;
  confidence: number;
  answer: string;
  note: string | null;
  answered_at: string;
  app_version: string;
}

function fromRow(row: Row): CalibrationAnswer {
  return CalibrationAnswerSchema.parse({
    findingId: row.finding_id,
    scanId: row.scan_id,
    ruleId: row.rule_id,
    engine: row.engine,
    wcag: JSON.parse(row.wcag),
    tierAtTime: row.tier_at_time,
    confidence: Number(row.confidence),
    answer: row.answer,
    ...(row.note !== null ? { note: row.note } : {}),
    answeredAt: row.answered_at,
    appVersion: row.app_version,
  }) as CalibrationAnswer;
}

/** SQLite store (node:sqlite, loaded lazily so a missing module can fall back to JSON). */
export async function createSqliteCalibrationStore(path: string): Promise<CalibrationStore> {
  const { DatabaseSync: Database } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db: DatabaseSync = new Database(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(CALIBRATION_SCHEMA_SQL);
  const upsert = db.prepare(
    `INSERT INTO calibration_answers
       (finding_id, scan_id, rule_id, engine, wcag, tier_at_time, confidence, answer, note, answered_at, app_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(finding_id) DO UPDATE SET
       scan_id = excluded.scan_id, rule_id = excluded.rule_id, engine = excluded.engine,
       wcag = excluded.wcag, tier_at_time = excluded.tier_at_time, confidence = excluded.confidence,
       answer = excluded.answer, note = excluded.note, answered_at = excluded.answered_at,
       app_version = excluded.app_version`,
  );
  const one = db.prepare('SELECT * FROM calibration_answers WHERE finding_id = ?');
  const all = db.prepare('SELECT * FROM calibration_answers ORDER BY answered_at, finding_id');
  let open = true;
  return {
    kind: 'sqlite',
    async save(a) {
      const answer = CalibrationAnswerSchema.parse(a) as CalibrationAnswer;
      upsert.run(
        answer.findingId,
        answer.scanId,
        answer.ruleId,
        answer.engine,
        JSON.stringify(answer.wcag),
        answer.tierAtTime,
        answer.confidence,
        answer.answer,
        answer.note ?? null,
        answer.answeredAt,
        answer.appVersion,
      );
      return answer;
    },
    async get(findingId) {
      const row = one.get(findingId) as Row | undefined;
      return row ? fromRow(row) : undefined;
    },
    async list() {
      return (all.all() as unknown as Row[]).map(fromRow);
    },
    async close() {
      if (open) db.close();
      open = false;
    },
  };
}

const JsonFileSchema = z.object({
  version: z.literal(1),
  answers: z.array(CalibrationAnswerSchema),
});

/** JSON-file store: the fallback when node:sqlite is not available. Same semantics. */
export function createJsonCalibrationStore(file: string): CalibrationStore {
  let cache: Map<string, CalibrationAnswer> | undefined;
  const load = async () => {
    if (!cache) {
      const data = await readJsonFile(file, JsonFileSchema, () => ({
        version: 1 as const,
        answers: [],
      }));
      cache = new Map(data.answers.map((a) => [a.findingId, a as CalibrationAnswer]));
    }
    return cache;
  };
  return {
    kind: 'json',
    async save(a) {
      const answer = CalibrationAnswerSchema.parse(a) as CalibrationAnswer;
      const map = await load();
      map.set(answer.findingId, answer);
      await writeJsonFile(file, { version: 1, answers: [...map.values()] });
      return answer;
    },
    async get(findingId) {
      return (await load()).get(findingId);
    },
    async list() {
      return [...(await load()).values()].sort(
        (a, b) =>
          a.answeredAt.localeCompare(b.answeredAt) || a.findingId.localeCompare(b.findingId),
      );
    },
    async close() {
      cache = undefined;
    },
  };
}

/** The export file format (documented in apps/desktop/README.md). */
export function toCalibrationExport(
  answers: CalibrationAnswer[],
  appVersion: string,
  now = new Date(),
): CalibrationExport {
  return {
    format: 'clear-a11y-calibration',
    version: 1,
    exportedAt: now.toISOString(),
    appVersion,
    answers,
  };
}
