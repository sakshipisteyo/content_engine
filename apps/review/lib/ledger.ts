import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { LEDGER_PATH } from "./repo";
import type { LedgerStage, Decision } from "./types";

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
