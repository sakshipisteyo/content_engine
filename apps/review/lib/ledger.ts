import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { LEDGER_PATH } from "./repo";
import type { LedgerStage, Decision, ScheduleEntry, ScheduleStatus } from "./types";

// Same schema the engine uses (CREATE IF NOT EXISTS keeps them compatible).
const SCHEMA = `
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

// process.getBuiltinModule loads a Node builtin without an import/require the bundler
// would try to inline (Turbopack chokes on node:sqlite otherwise). Node 24 supports it.
const getBuiltin = (
  process as unknown as { getBuiltinModule(id: string): { DatabaseSync: new (p: string) => DB } }
).getBuiltinModule;

function open(): DB {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true });
  const { DatabaseSync } = getBuiltin("node:sqlite");
  const db = new DatabaseSync(LEDGER_PATH);
  db.exec(SCHEMA);
  return db;
}

export function getStages(): LedgerStage[] {
  const db = open();
  try {
    return db.prepare("SELECT * FROM stages ORDER BY id").all() as LedgerStage[];
  } finally {
    db.close();
  }
}

export function getDecisions(): Decision[] {
  const db = open();
  try {
    return db.prepare("SELECT * FROM decisions ORDER BY id").all() as Decision[];
  } finally {
    db.close();
  }
}

export function addDecision(d: Decision): void {
  const db = open();
  try {
    db.prepare(
      `INSERT INTO decisions (brief_id, variant, action, note, rating, decided_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(d.brief_id, d.variant, d.action, d.note, d.rating, d.decided_at);
  } finally {
    db.close();
  }
}

export function getSchedule(): ScheduleEntry[] {
  const db = open();
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
}

export function addScheduleEntry(e: ScheduleEntry): void {
  const db = open();
  try {
    db.prepare(
      `INSERT INTO schedule (brief_id, variant, platform, scheduled_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(e.brief_id, e.variant, e.platform, e.scheduled_at, e.status, e.created_at);
  } finally {
    db.close();
  }
}

export function updateScheduleStatus(briefId: string, status: ScheduleStatus): void {
  const db = open();
  try {
    db.prepare("UPDATE schedule SET status = ? WHERE brief_id = ?").run(status, briefId);
  } finally {
    db.close();
  }
}

export function reschedule(briefId: string, newDate: string): void {
  const db = open();
  try {
    db.prepare("UPDATE schedule SET scheduled_at = ? WHERE brief_id = ? AND status = 'scheduled'")
      .run(newDate, briefId);
  } finally {
    db.close();
  }
}
