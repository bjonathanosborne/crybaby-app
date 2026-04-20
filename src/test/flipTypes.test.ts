import { describe, it, expect } from "vitest";
import type {
  FlipConfig,
  FlipState,
  CrybabyState,
  CrybabyHoleChoice,
  RollingCarryWindow,
  TeamInfo,
  Player,
} from "@/lib/gameEngines";

// ============================================================
// Flip type-system shape guards (Commit 1 of Flip full impl).
//
// These tests are compile-time-first: each one constructs a value
// of the new type and asserts a runtime field. If anyone changes
// the type's shape (renames a field, widens/narrows a union, flips
// optionality), these fail to compile before they fail at runtime.
// ============================================================

function mkPlayer(id: string, name: string): Player {
  return { id, name, handicap: 0, color: "#000" };
}

function mk5Players(): Player[] {
  return [
    mkPlayer("p1", "Alice"),
    mkPlayer("p2", "Bob"),
    mkPlayer("p3", "Carol"),
    mkPlayer("p4", "Dave"),
    mkPlayer("p5", "Eve"),
  ];
}

function mkTeams3v2(p: Player[]): TeamInfo {
  return {
    teamA: { name: "Heads", players: [p[0], p[1], p[2]], color: "#16A34A" },
    teamB: { name: "Tails", players: [p[3], p[4]],         color: "#DC2626" },
  };
}

describe("FlipConfig", () => {
  it("accepts numeric carryOverWindow", () => {
    const c: FlipConfig = { baseBet: 2, carryOverWindow: 3 };
    expect(c.baseBet).toBe(2);
    expect(c.carryOverWindow).toBe(3);
  });

  it("accepts 'all' sentinel for carryOverWindow", () => {
    const c: FlipConfig = { baseBet: 4, carryOverWindow: "all" };
    expect(c.carryOverWindow).toBe("all");
  });
});

describe("FlipState", () => {
  it("holds teamsByHole keyed by hole number", () => {
    const p = mk5Players();
    const s: FlipState = {
      teamsByHole: { 1: mkTeams3v2(p), 2: mkTeams3v2(p) },
      currentHole: 2,
    };
    expect(Object.keys(s.teamsByHole)).toEqual(["1", "2"]);
    expect(s.teamsByHole[1].teamA.players).toHaveLength(3);
    expect(s.teamsByHole[1].teamB.players).toHaveLength(2);
  });

  it("allows an empty teamsByHole at round start", () => {
    const s: FlipState = { teamsByHole: {}, currentHole: 0 };
    expect(Object.keys(s.teamsByHole)).toHaveLength(0);
  });
});

describe("RollingCarryWindow", () => {
  it("carries a FIFO queue + forfeited audit counter", () => {
    const w: RollingCarryWindow = {
      entries: [
        { holeNumber: 3, amount: 2 },
        { holeNumber: 7, amount: 2 },
      ],
      forfeited: 0,
      windowSize: 3,
    };
    expect(w.entries).toHaveLength(2);
    expect(w.forfeited).toBe(0);
    expect(w.windowSize).toBe(3);
  });

  it("supports 'all' for infinite window", () => {
    const w: RollingCarryWindow = { entries: [], forfeited: 0, windowSize: "all" };
    expect(w.windowSize).toBe("all");
  });
});

describe("CrybabyState", () => {
  it("stores crybaby, losing balance, max bet, and per-hole choices", () => {
    const p = mk5Players();
    const choice: CrybabyHoleChoice = {
      bet: 30,
      partner: "p2",
      teams: {
        teamA: { name: "Crybaby + Bob", players: [p[0], p[1]], color: "#EC4899" },
        teamB: { name: "Others",        players: [p[2], p[3], p[4]], color: "#3B82F6" },
      },
    };
    const s: CrybabyState = {
      crybaby: "p1",
      losingBalance: 60,
      maxBetPerHole: 30,
      byHole: { 16: choice },
    };
    expect(s.crybaby).toBe("p1");
    expect(s.losingBalance).toBe(60);
    expect(s.maxBetPerHole).toBe(30);
    expect(s.byHole[16].bet).toBe(30);
    expect(s.byHole[16].partner).toBe("p2");
    expect(s.byHole[16].teams.teamA.players).toHaveLength(2);
    expect(s.byHole[16].teams.teamB.players).toHaveLength(3);
  });

  it("stores tiebreakOutcome with seed source when ambiguous", () => {
    const s: CrybabyState = {
      crybaby: "p3",
      losingBalance: 40,
      maxBetPerHole: 20,
      byHole: {},
      tiebreakOutcome: {
        tied: ["p1", "p3"],
        winner: "p3",
        seedSource: "round-abc-123",
      },
    };
    expect(s.tiebreakOutcome?.tied).toEqual(["p1", "p3"]);
    expect(s.tiebreakOutcome?.winner).toBe("p3");
    expect(s.tiebreakOutcome?.seedSource).toBe("round-abc-123");
  });

  it("tiebreakOutcome is optional (undefined when crybaby was unambiguous)", () => {
    const s: CrybabyState = {
      crybaby: "p1",
      losingBalance: 60,
      maxBetPerHole: 30,
      byHole: {},
    };
    expect(s.tiebreakOutcome).toBeUndefined();
  });
});

describe("Migration 20260420010000 — round_settlements flip components", () => {
  it("adds nullable base_amount + crybaby_amount columns with IF NOT EXISTS", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260420010000_round_settlements_flip_components.sql"),
      "utf-8",
    );
    // Both columns NUMERIC, nullable, idempotent.
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS base_amount\s+NUMERIC/);
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS crybaby_amount\s+NUMERIC/);
    // COMMENT clauses document Flip-specific semantics for future readers.
    expect(src).toMatch(/COMMENT ON COLUMN public\.round_settlements\.base_amount/);
    expect(src).toMatch(/COMMENT ON COLUMN public\.round_settlements\.crybaby_amount/);
    // Columns must NOT be declared NOT NULL — legacy rounds stay unaffected.
    expect(src).not.toMatch(/base_amount\s+NUMERIC\s+NOT\s+NULL/i);
    expect(src).not.toMatch(/crybaby_amount\s+NUMERIC\s+NOT\s+NULL/i);
  });
});
