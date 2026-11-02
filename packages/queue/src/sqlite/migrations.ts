/** Minimal surface of `node:sqlite`'s DatabaseSync that migrations need. */
export interface SqlExec {
  exec(sql: string): void;
  prepare(sql: string): { get(...params: never[]): unknown };
}

/**
 * Schema migrations, applied in order. The database's `PRAGMA user_version` records how many ran.
 * Never edit a released migration; append a new one.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS jobs (
     seq          INTEGER PRIMARY KEY AUTOINCREMENT,
     id           TEXT    NOT NULL UNIQUE,
     queue        TEXT    NOT NULL,
     status       TEXT    NOT NULL
                  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
     payload      TEXT    NOT NULL,
     result       TEXT,
     error        TEXT,
     progress     TEXT,
     attempts     INTEGER NOT NULL DEFAULT 0,
     max_attempts INTEGER NOT NULL DEFAULT 1,
     worker_id    TEXT,
     heartbeat_at INTEGER,
     created_at   TEXT    NOT NULL,
     updated_at   TEXT    NOT NULL,
     started_at   TEXT,
     finished_at  TEXT
   );
   CREATE INDEX IF NOT EXISTS jobs_queue_status_seq ON jobs (queue, status, seq);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Runs pending migrations inside one transaction. Refuses a database from a newer version. */
export function migrate(db: SqlExec): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = Number(row.user_version);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Queue database schema v${current} is newer than this @clear-a11y/queue (v${SCHEMA_VERSION}). Upgrade the package.`,
    );
  }
  if (current === SCHEMA_VERSION) return current;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let v = current; v < SCHEMA_VERSION; v++) db.exec(MIGRATIONS[v] as string);
    // PRAGMA does not accept bound parameters; SCHEMA_VERSION is a compile-time integer.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return SCHEMA_VERSION;
}
