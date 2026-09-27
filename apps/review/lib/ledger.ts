import "server-only";
import type { LedgerStage, Decision, ScheduleEntry, ScheduleStatus } from "./types";

const usePostgres = !!process.env.DATABASE_URL;

// --------------- Postgres (Neon serverless) ---------------

let pgReady = false;

async function pgSql() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  if (!pgReady) {
    await sql`CREATE TABLE IF NOT EXISTS stages (
      id SERIAL PRIMARY KEY,
      run_id TEXT NOT NULL, brief_id TEXT NOT NULL, variant INTEGER, stage TEXT NOT NULL,
      model TEXT, credits REAL NOT NULL DEFAULT 0, seconds REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL, error TEXT, started_at TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS decisions (
      id SERIAL PRIMARY KEY,
      brief_id TEXT NOT NULL, variant INTEGER, action TEXT NOT NULL,
      note TEXT, rating INTEGER, decided_at TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS schedule (
      id SERIAL PRIMARY KEY,
      brief_id TEXT NOT NULL, variant INTEGER, platform TEXT NOT NULL,
      scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL
    )`;
    pgReady = true;
  }
  return sql;
}

// --------------- SQLite (local dev) ---------------

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL, brief_id TEXT NOT NULL, variant INTEGER, stage TEXT NOT NULL,
  model TEXT, credits REAL NOT NULL DEFAULT 0, seconds REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL, error TEXT, started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_id TEXT NOT NULL, variant INTEGER, action TEXT NOT NULL,
  note TEXT, rating INTEGER, decided_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_id TEXT NOT NULL, variant INTEGER, platform TEXT NOT NULL,
  scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);
`;

type DB = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...a: unknown[]): unknown[];
    run(...a: unknown[]): unknown;
  };
  close(): void;
};

function openSqlite(): DB {
  const { mkdirSync } = require("node:fs") as typeof import("node:fs");
  const { dirname, join } = require("node:path") as typeof import("node:path");
  const { existsSync } = require("node:fs") as typeof import("node:fs");

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const ledgerPath = join(dir, "data", "ledger.sqlite");
  mkdirSync(dirname(ledgerPath), { recursive: true });

  const getBuiltin = (
    process as unknown as { getBuiltinModule(id: string): { DatabaseSync: new (p: string) => DB } }
  ).getBuiltinModule;
  const { DatabaseSync } = getBuiltin("node:sqlite");
  const db = new DatabaseSync(ledgerPath);
  db.exec(SQLITE_SCHEMA);
  return db;
}

// --------------- Public API (async) ---------------

export async function getStages(): Promise<LedgerStage[]> {
  if (usePostgres) {
    const sql = await pgSql();
    return (await sql`SELECT * FROM stages ORDER BY id`) as LedgerStage[];
  }
  try {
    const db = openSqlite();
    try {
      return db.prepare("SELECT * FROM stages ORDER BY id").all() as LedgerStage[];
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function getDecisions(): Promise<Decision[]> {
  if (usePostgres) {
    const sql = await pgSql();
    return (await sql`SELECT * FROM decisions ORDER BY id`) as Decision[];
  }
  try {
    const db = openSqlite();
    try {
      return db.prepare("SELECT * FROM decisions ORDER BY id").all() as Decision[];
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function addDecision(d: Decision): Promise<void> {
  if (usePostgres) {
    const sql = await pgSql();
    await sql`INSERT INTO decisions (brief_id, variant, action, note, rating, decided_at)
              VALUES (${d.brief_id}, ${d.variant}, ${d.action}, ${d.note}, ${d.rating}, ${d.decided_at})`;
    return;
  }
  try {
    const db = openSqlite();
    try {
      db.prepare(
        `INSERT INTO decisions (brief_id, variant, action, note, rating, decided_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(d.brief_id, d.variant, d.action, d.note, d.rating, d.decided_at);
    } finally {
      db.close();
    }
  } catch { /* read-only FS on serverless */ }
}

export async function getSchedule(): Promise<ScheduleEntry[]> {
  if (usePostgres) {
    const sql = await pgSql();
    const rows = await sql`SELECT brief_id, variant, platform, scheduled_at, status, created_at
                           FROM schedule ORDER BY scheduled_at`;
    return rows.map((r: Record<string, unknown>) => ({
      brief_id: String(r.brief_id),
      variant: r.variant == null ? null : Number(r.variant),
      platform: String(r.platform),
      scheduled_at: String(r.scheduled_at),
      status: String(r.status) as ScheduleStatus,
      created_at: String(r.created_at),
    }));
  }
  try {
    const db = openSqlite();
    try {
      const rows = db.prepare("SELECT brief_id, variant, platform, scheduled_at, status, created_at FROM schedule ORDER BY scheduled_at").all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        brief_id: String(r.brief_id),
        variant: r.variant == null ? null : Number(r.variant),
        platform: String(r.platform),
        scheduled_at: String(r.scheduled_at),
        status: String(r.status) as ScheduleStatus,
        created_at: String(r.created_at),
      }));
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function addScheduleEntry(e: ScheduleEntry): Promise<void> {
  if (usePostgres) {
    const sql = await pgSql();
    await sql`INSERT INTO schedule (brief_id, variant, platform, scheduled_at, status, created_at)
              VALUES (${e.brief_id}, ${e.variant}, ${e.platform}, ${e.scheduled_at}, ${e.status}, ${e.created_at})`;
    return;
  }
  try {
    const db = openSqlite();
    try {
      db.prepare(
        `INSERT INTO schedule (brief_id, variant, platform, scheduled_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(e.brief_id, e.variant, e.platform, e.scheduled_at, e.status, e.created_at);
    } finally {
      db.close();
    }
  } catch { /* read-only FS on serverless */ }
}

export async function updateScheduleStatus(briefId: string, status: ScheduleStatus): Promise<void> {
  if (usePostgres) {
    const sql = await pgSql();
    await sql`UPDATE schedule SET status = ${status} WHERE brief_id = ${briefId}`;
    return;
  }
  try {
    const db = openSqlite();
    try {
      db.prepare("UPDATE schedule SET status = ? WHERE brief_id = ?").run(status, briefId);
    } finally {
      db.close();
    }
  } catch { /* read-only FS on serverless */ }
}

export async function reschedule(briefId: string, newDate: string): Promise<void> {
  if (usePostgres) {
    const sql = await pgSql();
    await sql`UPDATE schedule SET scheduled_at = ${newDate} WHERE brief_id = ${briefId} AND status = 'scheduled'`;
    return;
  }
  try {
    const db = openSqlite();
    try {
      db.prepare("UPDATE schedule SET scheduled_at = ? WHERE brief_id = ? AND status = 'scheduled'")
        .run(newDate, briefId);
    } finally {
      db.close();
    }
  } catch { /* read-only FS on serverless */ }
}
