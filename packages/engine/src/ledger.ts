/**
 * Cost + decision ledger, backed by Node's built-in node:sqlite (DecisionsSync).
 * Everything SQLite-specific is confined to this file behind the Ledger interface,
 * so swapping to better-sqlite3 later (once a build toolchain exists) is a one-file
 * change. SPEC: every stage writes one row before it returns, including failures.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// node:sqlite prints an experimental-feature warning on some Node builds. Swallow
// just that one; leave every other warning intact. (Patched before construction.)
const _origEmitWarning = process.emitWarning.bind(process);
(process as typeof process).emitWarning = ((warning: unknown, ...rest: unknown[]) => {
  const msg = typeof warning === "string" ? warning : (warning as Error)?.message;
  if (msg && msg.includes("SQLite is an experimental feature")) return;
  // @ts-expect-error pass-through to the original variadic signature
  return _origEmitWarning(warning, ...rest);
}) as typeof process.emitWarning;

// Load via createRequire so bundlers (Vite/vitest) don't try to pre-resolve the
// newer `node:sqlite` builtin; the type-only import is erased at compile time.
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
import { PATHS } from "./config";
import type { LedgerStage, Decision, StageName } from "./schemas";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  brief_id   TEXT NOT NULL,
  variant    INTEGER,
  stage      TEXT NOT NULL,
  model      TEXT,
  credits    REAL NOT NULL DEFAULT 0,
  seconds    REAL NOT NULL DEFAULT 0,
  status     TEXT NOT NULL,
  error      TEXT,
  started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_id   TEXT NOT NULL,
  variant    INTEGER,
  action     TEXT NOT NULL,
  note       TEXT,
  rating     INTEGER,
  decided_at TEXT NOT NULL
);
`;

export interface Ledger {
  recordStage(row: LedgerStage): void;
  /** True if a stage completed OK for (brief_id, variant, stage) — for idempotency. */
  stageDone(brief_id: string, variant: number | null, stage: StageName): boolean;
  recordDecision(row: Decision): void;
  /** Delete stage rows for a brief from `stage` onward (used by --from re-runs). */
  clearFrom(brief_id: string, stages: StageName[]): void;
  countStages(): number;
  allStages(): LedgerStage[];
  allDecisions(): Decision[];
  close(): void;
}

class SqliteLedger implements Ledger {
  private db: DatabaseSyncType;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  recordStage(row: LedgerStage): void {
    this.db
      .prepare(
        `INSERT INTO stages
         (run_id, brief_id, variant, stage, model, credits, seconds, status, error, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.run_id,
        row.brief_id,
        row.variant,
        row.stage,
        row.model,
        row.credits,
        row.seconds,
        row.status,
        row.error,
        row.started_at,
      );
  }

  stageDone(brief_id: string, variant: number | null, stage: StageName): boolean {
    const sql =
      variant === null
        ? `SELECT COUNT(*) AS n FROM stages WHERE brief_id = ? AND variant IS NULL AND stage = ? AND status = 'ok'`
        : `SELECT COUNT(*) AS n FROM stages WHERE brief_id = ? AND variant = ? AND stage = ? AND status = 'ok'`;
    const row =
      variant === null
        ? (this.db.prepare(sql).get(brief_id, stage) as { n: number })
        : (this.db.prepare(sql).get(brief_id, variant, stage) as { n: number });
    return row.n > 0;
  }

  recordDecision(row: Decision): void {
    this.db
      .prepare(
        `INSERT INTO decisions (brief_id, variant, action, note, rating, decided_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(row.brief_id, row.variant, row.action, row.note, row.rating, row.decided_at);
  }

  clearFrom(brief_id: string, stages: StageName[]): void {
    if (stages.length === 0) return;
    const placeholders = stages.map(() => "?").join(", ");
    this.db
      .prepare(`DELETE FROM stages WHERE brief_id = ? AND stage IN (${placeholders})`)
      .run(brief_id, ...stages);
  }

  countStages(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM stages`).get() as { n: number }).n;
  }

  allStages(): LedgerStage[] {
    return this.db.prepare(`SELECT * FROM stages ORDER BY id`).all() as unknown as LedgerStage[];
  }

  allDecisions(): Decision[] {
    return this.db
      .prepare(`SELECT * FROM decisions ORDER BY id`)
      .all() as unknown as Decision[];
  }

  close(): void {
    this.db.close();
  }
}

/** Open (creating if needed) the ledger at data/ledger.sqlite. */
export function openLedger(dbPath: string = PATHS.ledger): Ledger {
  return new SqliteLedger(dbPath);
}

/** ISO timestamp helper for ledger rows. */
export function now(): string {
  return new Date().toISOString();
}
