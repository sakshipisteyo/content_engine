import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedger, now, type Ledger, type LedgerStage, type Decision } from "../src/index";

function stage(overrides: Partial<LedgerStage>): LedgerStage {
  return {
    run_id: "run-1",
    brief_id: "banj-001",
    variant: 1,
    stage: "hero",
    model: "/v1/text2image/soul",
    credits: 4,
    seconds: 1.2,
    status: "ok",
    error: null,
    started_at: now(),
    ...overrides,
  };
}

describe("ledger", () => {
  let dir: string;
  let ledger: Ledger;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ce-ledger-"));
    ledger = openLedger(join(dir, "ledger.sqlite"));
  });
  afterEach(() => {
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(ledger.countStages()).toBe(0);
  });

  it("records a stage row and reads it back", () => {
    ledger.recordStage(stage({}));
    expect(ledger.countStages()).toBe(1);
    const rows = ledger.allStages();
    expect(rows[0]!.brief_id).toBe("banj-001");
    expect(rows[0]!.credits).toBe(4);
    expect(rows[0]!.status).toBe("ok");
  });

  it("stageDone reflects only ok rows for the right key", () => {
    ledger.recordStage(stage({ variant: 1, stage: "hero", status: "ok" }));
    expect(ledger.stageDone("banj-001", 1, "hero")).toBe(true);
    expect(ledger.stageDone("banj-001", 2, "hero")).toBe(false);
    ledger.recordStage(stage({ variant: 2, stage: "hero", status: "failed" }));
    expect(ledger.stageDone("banj-001", 2, "hero")).toBe(false); // failed != done
  });

  it("handles null-variant (brief-level) stages", () => {
    ledger.recordStage(stage({ variant: null, stage: "compile", credits: 0 }));
    expect(ledger.stageDone("banj-001", null, "compile")).toBe(true);
  });

  it("clearFrom deletes only the named stages", () => {
    ledger.recordStage(stage({ stage: "hero" }));
    ledger.recordStage(stage({ stage: "score-1" }));
    ledger.recordStage(stage({ stage: "copy", variant: null }));
    ledger.clearFrom("banj-001", ["score-1", "copy"]);
    const remaining = ledger.allStages().map((s) => s.stage);
    expect(remaining).toEqual(["hero"]);
  });

  it("records decisions", () => {
    const d: Decision = {
      brief_id: "banj-001",
      variant: 1,
      action: "approve",
      note: "love the light",
      rating: 5,
      decided_at: now(),
    };
    ledger.recordDecision(d);
    const rows = ledger.allDecisions();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rating).toBe(5);
    expect(rows[0]!.action).toBe("approve");
  });
});
