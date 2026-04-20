import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initFlipState,
  commitFlipTeams,
  advanceFlipState,
  initRollingCarryWindow,
  appendPushToWindow,
  claimRollingCarryWindow,
  calculateFlipHoleResult,
  getTeamsForHole,
  generateFlipTeams,
  type FlipState,
  type RollingCarryWindow,
  type TeamInfo,
  type Player,
} from "@/lib/gameEngines";

// ============================================================
// Flip engine pure primitives — Commit 2 of Flip full impl.
//
// Exercises:
//   - initFlipState / commitFlipTeams / advanceFlipState
//     (push-carries-teams, decided-reshuffles)
//   - initRollingCarryWindow / appendPushToWindow
//     (FIFO eviction with forfeit accumulation)
//   - claimRollingCarryWindow (sum + clear)
//   - calculateFlipHoleResult (3v2 + 2v3 payout math, carry-claim)
//   - getTeamsForHole widened to accept FlipState
// ============================================================

function mkPlayer(id: string): Player {
  return { id, name: id.toUpperCase(), handicap: 0, color: "#000" };
}
const P = [mkPlayer("p1"), mkPlayer("p2"), mkPlayer("p3"), mkPlayer("p4"), mkPlayer("p5")];

function mkTeams3v2(first3: Player[], last2: Player[]): TeamInfo {
  return {
    teamA: { name: "Heads", players: first3, color: "#16A34A" },
    teamB: { name: "Tails", players: last2, color: "#DC2626" },
  };
}

// ============================================================
// FLIP STATE PRIMITIVES
// ============================================================

describe("initFlipState", () => {
  it("returns an empty state at round start", () => {
    const s = initFlipState();
    expect(s.teamsByHole).toEqual({});
    expect(s.currentHole).toBe(0);
  });
});

describe("commitFlipTeams", () => {
  it("adds teams for a hole and advances currentHole", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const s = commitFlipTeams(initFlipState(), 1, teams);
    expect(s.teamsByHole[1]).toBe(teams);
    expect(s.currentHole).toBe(1);
  });

  it("does not regress currentHole when committing an earlier hole", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    let s = commitFlipTeams(initFlipState(), 5, teams);
    s = commitFlipTeams(s, 3, teams); // out-of-order commit
    expect(s.currentHole).toBe(5);
  });

  it("is immutable — returns a new state object", () => {
    const a = initFlipState();
    const b = commitFlipTeams(a, 1, mkTeams3v2([P[0]], [P[1]]));
    expect(a).not.toBe(b);
    expect(a.teamsByHole).toEqual({}); // original untouched
  });
});

describe("advanceFlipState", () => {
  // Stub the shuffle so tests are deterministic.
  beforeEach(() => {
    // Math.random → 0.1, 0.2, ..., deterministic sort but that's
    // fine; the test only asserts "teams CHANGE" vs "teams STAY".
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("carries teams forward after a push", () => {
    const holeOneTeams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    let s = commitFlipTeams(initFlipState(), 1, holeOneTeams);
    s = advanceFlipState(s, 1, /* push */ true, P);
    expect(s.teamsByHole[2]).toBe(holeOneTeams);
    expect(s.currentHole).toBe(2);
  });

  it("reshuffles after a decided hole (win/loss)", () => {
    const holeOneTeams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    let s = commitFlipTeams(initFlipState(), 1, holeOneTeams);
    s = advanceFlipState(s, 1, /* push */ false, P);
    // New teams object (not === to the prior one)
    expect(s.teamsByHole[2]).not.toBe(holeOneTeams);
    expect(s.teamsByHole[2].teamA.players.length + s.teamsByHole[2].teamB.players.length).toBe(5);
  });

  it("generates fresh teams when no prior hole teams exist (fallback)", () => {
    const s = advanceFlipState(initFlipState(), 0, false, P);
    expect(s.teamsByHole[1]).toBeDefined();
    expect(s.teamsByHole[1].teamA.players.length + s.teamsByHole[1].teamB.players.length).toBe(5);
  });

  it("5-player generation produces 3v2 split", () => {
    const teams = generateFlipTeams(P);
    const total = teams.teamA.players.length + teams.teamB.players.length;
    expect(total).toBe(5);
    // ceil(5/2) = 3 on the first-split side
    expect(Math.max(teams.teamA.players.length, teams.teamB.players.length)).toBe(3);
    expect(Math.min(teams.teamA.players.length, teams.teamB.players.length)).toBe(2);
  });
});

// ============================================================
// ROLLING CARRY WINDOW
// ============================================================

describe("initRollingCarryWindow", () => {
  it("accepts a numeric size", () => {
    const w = initRollingCarryWindow(3);
    expect(w).toEqual({ entries: [], forfeited: 0, windowSize: 3 });
  });
  it("accepts 'all' for infinite size", () => {
    const w = initRollingCarryWindow("all");
    expect(w.windowSize).toBe("all");
  });
});

describe("appendPushToWindow", () => {
  it("appends an entry within window capacity (no forfeit)", () => {
    let w = initRollingCarryWindow(3);
    w = appendPushToWindow(w, 2, 2);
    w = appendPushToWindow(w, 5, 2);
    expect(w.entries).toHaveLength(2);
    expect(w.forfeited).toBe(0);
  });

  it("evicts the oldest entry when the window fills (forfeit counted)", () => {
    let w = initRollingCarryWindow(2);
    w = appendPushToWindow(w, 2, 4); // [2:$4]
    w = appendPushToWindow(w, 5, 4); // [2:$4, 5:$4]
    w = appendPushToWindow(w, 7, 4); // drops hole 2 ($4 forfeited) → [5:$4, 7:$4]
    expect(w.entries).toEqual([
      { holeNumber: 5, amount: 4 },
      { holeNumber: 7, amount: 4 },
    ]);
    expect(w.forfeited).toBe(4);
  });

  it("accumulates forfeits across multiple evictions", () => {
    let w = initRollingCarryWindow(1);
    w = appendPushToWindow(w, 1, 2);
    w = appendPushToWindow(w, 2, 4); // drops hole 1 ($2 forfeited)
    w = appendPushToWindow(w, 3, 6); // drops hole 2 ($4 forfeited)
    expect(w.entries).toEqual([{ holeNumber: 3, amount: 6 }]);
    expect(w.forfeited).toBe(6); // 2 + 4
  });

  it("'all' never evicts", () => {
    let w = initRollingCarryWindow("all");
    for (let h = 1; h <= 10; h++) w = appendPushToWindow(w, h, h);
    expect(w.entries).toHaveLength(10);
    expect(w.forfeited).toBe(0);
  });
});

describe("claimRollingCarryWindow", () => {
  it("returns the sum of entries and clears them", () => {
    let w = initRollingCarryWindow(3);
    w = appendPushToWindow(w, 2, 2);
    w = appendPushToWindow(w, 5, 4);
    w = appendPushToWindow(w, 7, 6);
    const { total, cleared } = claimRollingCarryWindow(w);
    expect(total).toBe(12);
    expect(cleared.entries).toHaveLength(0);
  });

  it("preserves the forfeited counter across claims", () => {
    let w = initRollingCarryWindow(1);
    w = appendPushToWindow(w, 1, 2);
    w = appendPushToWindow(w, 2, 2); // forfeits $2
    const { cleared } = claimRollingCarryWindow(w);
    expect(cleared.forfeited).toBe(2);
  });

  it("returns 0 and an empty clear on an already-empty window", () => {
    const { total, cleared } = claimRollingCarryWindow(initRollingCarryWindow(3));
    expect(total).toBe(0);
    expect(cleared.entries).toEqual([]);
  });
});

// ============================================================
// calculateFlipHoleResult — 3v2 payout math
// ============================================================

describe("calculateFlipHoleResult — 3-man team wins (Model C)", () => {
  it("2-man losers pay 1.5B each; 3 winners split the 3B pot → B each (B=$2 → $2/winner, -$3/loser)", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 4, teamBBest: 5, // A (3-man) wins
      effectiveBet: 2, window: initRollingCarryWindow(3), holeNumber: 1,
    });
    expect(r.push).toBe(false);
    expect(r.winningSide).toBe("A");
    // 2-man losers (p4, p5) each pay 1.5 * $2 = $3. Pot $6. 3 winners split → $2 each.
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(2);
    expect(r.perPlayer.find(p => p.id === "p2")!.amount).toBe(2);
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBe(2);
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(-3);
    expect(r.perPlayer.find(p => p.id === "p5")!.amount).toBe(-3);
    // Sum = 0 on a pure decided hole with no prior window.
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(0);
    // potFromBet = losers' collective contribution = 3B = $6.
    expect(r.potFromBet).toBe(6);
  });

  it("even-bet invariant: B=$4 → 2-man losers pay $6 each, winners get $4 each", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 4, teamBBest: 5,
      effectiveBet: 4, window: initRollingCarryWindow(3), holeNumber: 1,
    });
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(-6); // 1.5 * $4
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(4);  // $12 / 3
  });
});

describe("calculateFlipHoleResult — 2-man team wins (Model C)", () => {
  it("3-man losers pay B each; 2 winners split the 3B pot → 1.5B each (B=$2 → $3/winner, -$2/loser)", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 6, teamBBest: 4, // B (2-man) wins
      effectiveBet: 2, window: initRollingCarryWindow(3), holeNumber: 1,
    });
    expect(r.winningSide).toBe("B");
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(3);
    expect(r.perPlayer.find(p => p.id === "p5")!.amount).toBe(3);
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(-2);
    expect(r.perPlayer.find(p => p.id === "p2")!.amount).toBe(-2);
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBe(-2);
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(0);
  });
});

describe("calculateFlipHoleResult — push (Model C)", () => {
  it("every player antes B; window entry = N*B; per-player amount = -B", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 5, teamBBest: 5,
      effectiveBet: 2, window: initRollingCarryWindow(3), holeNumber: 1,
    });
    expect(r.push).toBe(true);
    // All 5 players each debit $2 (flat ante).
    expect(r.perPlayer.every(p => p.amount === -2)).toBe(true);
    // Window entry = 5 * $2 = $10 (full hole pot).
    expect(r.newWindow.entries).toEqual([{ holeNumber: 1, amount: 10 }]);
    // Sum of deltas = -N*B = -$10 (real money out of wallets).
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(-10);
    expect(r.potFromBet).toBe(10); // total ante pot
  });
});

describe("calculateFlipHoleResult — decided hole claims the rolling carry (Model C)", () => {
  it("winners take 3B from fresh losers + full window", () => {
    // Seed window with two prior pushes ($10 each from a 5-player round).
    let window = initRollingCarryWindow(3);
    window = appendPushToWindow(window, 1, 10);
    window = appendPushToWindow(window, 2, 10); // window sum = $20

    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 4, teamBBest: 5, // A (3-man) wins
      effectiveBet: 2, window, holeNumber: 3,
    });
    // Fresh pot = 2 * 1.5B = 2 * $3 = $6. Carry = $20. Total pot = $26.
    // 3 winners split → $26/3 each ≈ $8.667. 2-man losers each pay $3.
    expect(r.potFromBet).toBe(6);
    expect(r.potFromCarry).toBe(20);
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBeCloseTo(26 / 3, 5);
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(-3);
    expect(r.newWindow.entries).toHaveLength(0); // cleared
  });
});

describe("calculateFlipHoleResult — forfeit accounting on push that evicts (Model C)", () => {
  it("push after full window reports forfeit = evicted hole's N*B", () => {
    // Window size 2, seed with two $10 push entries (5 players × $2 each).
    let window = initRollingCarryWindow(2);
    window = appendPushToWindow(window, 1, 10);
    window = appendPushToWindow(window, 2, 10);
    // Next push evicts hole 1 ($10 forfeited).

    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 5, teamBBest: 5,
      effectiveBet: 2, window, holeNumber: 3,
    });
    expect(r.push).toBe(true);
    expect(r.forfeitedThisHole).toBe(10);
    expect(r.newWindow.entries).toEqual([
      { holeNumber: 2, amount: 10 },
      { holeNumber: 3, amount: 10 },
    ]);
    expect(r.newWindow.forfeited).toBe(10); // cumulative real money lost
    // All 5 players still debit the new hole's ante.
    expect(r.perPlayer.every(p => p.amount === -2)).toBe(true);
  });
});

// ============================================================
// getTeamsForHole — widened signature
// ============================================================

describe("getTeamsForHole (widened for FlipState)", () => {
  it("returns per-hole teams when a FlipState is passed", () => {
    const holeTwoTeams = mkTeams3v2([P[0], P[1], P[3]], [P[2], P[4]]);
    const state: FlipState = { teamsByHole: { 2: holeTwoTeams }, currentHole: 2 };
    expect(getTeamsForHole("flip", 2, P, state)).toBe(holeTwoTeams);
  });

  it("returns null when FlipState has no entry for the requested hole", () => {
    const state: FlipState = { teamsByHole: { 1: mkTeams3v2([P[0]], [P[1]]) }, currentHole: 1 };
    expect(getTeamsForHole("flip", 5, P, state)).toBeNull();
  });

  it("backward-compat: legacy static TeamInfo still works for every hole", () => {
    const legacyTeams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    expect(getTeamsForHole("flip", 1, P, legacyTeams)).toBe(legacyTeams);
    expect(getTeamsForHole("flip", 12, P, legacyTeams)).toBe(legacyTeams);
  });

  it("crybaby hole (16-18) prefers crybabyTeams over flipState", () => {
    const baseTeams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const flipState: FlipState = { teamsByHole: { 16: baseTeams }, currentHole: 16 };
    const crybabyTeams = mkTeams3v2([P[0], P[1]], [P[2], P[3], P[4]]); // 2v3
    const got = getTeamsForHole("flip", 16, P, flipState, crybabyTeams);
    expect(got).toBe(crybabyTeams);
  });

  it("crybaby hole without crybabyTeams falls back to flipState (edge case, shouldn't normally happen)", () => {
    const baseTeams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const flipState: FlipState = { teamsByHole: { 16: baseTeams }, currentHole: 16 };
    expect(getTeamsForHole("flip", 16, P, flipState)).toBe(baseTeams);
  });
});

// ============================================================
// Integration: push-decided-push-push-decided scenario
// ============================================================

// ============================================================
// replayRound equivalence — per-hole FlipState + rolling window
// ============================================================

describe("replayRound equivalence — Flip per-hole teams + rolling window (Model C)", () => {
  it("totals match whether played hole-by-hole or replayed in one pass", async () => {
    const { replayRound } = await import("@/lib/gameEngines");
    const BET = 2;
    const teams1 = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const teams2 = mkTeams3v2([P[0], P[3], P[4]], [P[1], P[2]]);
    const teams3 = mkTeams3v2([P[1], P[2], P[4]], [P[0], P[3]]);

    const flipState: FlipState = {
      teamsByHole: { 1: teams1, 2: teams2, 3: teams3 },
      currentHole: 3,
    };

    const replayed = replayRound(
      "flip",
      P,
      Array(18).fill(4),
      Array.from({ length: 18 }, (_, i) => i + 1),
      BET,
      {
        hammer: false, hammerInitiator: "any", hammerMaxDepth: "1",
        crybaby: false, crybabHoles: 0, crybabHammerRule: "allowed",
        birdieBonus: false, birdieMultiplier: 2, pops: false,
        noPopsParThree: true, carryOverCap: "∞", handicapPercent: 100,
        presses: false, pressType: "auto",
      },
      [
        { holeNumber: 1, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
        { holeNumber: 2, scores: { p1: 5, p2: 4, p3: 4, p4: 5, p5: 5 }, hammerDepth: 0, folded: false }, // teamA=[p1,p4,p5] vs teamB=[p2,p3]. B wins.
        { holeNumber: 3, scores: { p1: 4, p2: 5, p3: 5, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // teamA=[p2,p3,p5] best=4 (p5), teamB=[p0,p3]-> teamA=[p2,p3,p5] teamB=[p1,p4]. teamA best=4, teamB best=4 → push
      ],
      flipState,
      { baseBet: BET, carryOverWindow: 3 },
    );

    // Hand-computed expectations under Model C:
    //   Hole 1 push: each player -$2. Window: [h1:$10].
    //     Running: p1=-2, p2=-2, p3=-2, p4=-2, p5=-2.
    //   Hole 2 decided, teamA=[p1,p4,p5] vs teamB=[p2,p3]. B (2-man) wins.
    //     3-man losers (p1,p4,p5) each pay $2. Pot = $6 + $10 carry = $16. 2 winners split $8 each.
    //     Running: p1=-4, p2=+6, p3=+6, p4=-4, p5=-4.
    //   Hole 3 push: each player -$2. Window: [h3:$10].
    //     Running: p1=-6, p2=+4, p3=+4, p4=-6, p5=-6.
    expect(replayed.totals.p1).toBeCloseTo(-6, 5);
    expect(replayed.totals.p2).toBeCloseTo(4, 5);
    expect(replayed.totals.p3).toBeCloseTo(4, 5);
    expect(replayed.totals.p4).toBeCloseTo(-6, 5);
    expect(replayed.totals.p5).toBeCloseTo(-6, 5);
    // Sum = -10. Window holds $10 (unclaimed), forfeit $0 (no evictions, window=3).
    // Invariant: sum = -(forfeit + unclaimed) = -(0 + 10) = -10 ✓
    const sum = Object.values(replayed.totals).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(-10, 5);
  });
});

describe("Flip scenario integration — rolling window over a 5-hole sequence (Model C)", () => {
  it("hole 1 push, hole 2 decided, hole 3 push, hole 4 push (window=2), hole 5 decided", () => {
    const teams1 = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const teams2 = mkTeams3v2([P[0], P[3], P[4]], [P[1], P[2]]);
    const BET = 2;
    let window = initRollingCarryWindow(2);

    // Hole 1: push → window: [1:$10] (5 × $2). All 5 players ante -$2.
    const h1 = calculateFlipHoleResult({
      teams: teams1, teamABest: 4, teamBBest: 4,
      effectiveBet: BET, window, holeNumber: 1,
    });
    window = h1.newWindow;
    expect(window.entries).toEqual([{ holeNumber: 1, amount: 10 }]);
    expect(h1.perPlayer.every(p => p.amount === -2)).toBe(true);

    // Hole 2: teams2 has teamA = [p1, p4, p5] (3-man), teamB = [p2, p3] (2-man). B wins.
    // Losers (3-man p1,p4,p5) each pay $2 = $6 pot. Carry $10. Total $16. 2 winners → $8 each.
    const h2 = calculateFlipHoleResult({
      teams: teams2, teamABest: 5, teamBBest: 4,
      effectiveBet: BET, window, holeNumber: 2,
    });
    expect(h2.winningSide).toBe("B");
    expect(h2.potFromBet).toBe(6);   // 3 losers * $2
    expect(h2.potFromCarry).toBe(10); // hole 1 ante pot
    expect(h2.perPlayer.find(p => p.id === "p2")!.amount).toBe(8);
    expect(h2.perPlayer.find(p => p.id === "p3")!.amount).toBe(8);
    expect(h2.perPlayer.find(p => p.id === "p1")!.amount).toBe(-2);
    expect(h2.perPlayer.find(p => p.id === "p4")!.amount).toBe(-2);
    expect(h2.perPlayer.find(p => p.id === "p5")!.amount).toBe(-2);
    window = h2.newWindow;
    expect(window.entries).toHaveLength(0); // cleared on claim

    // Hole 3: push → window: [3:$10]. Each player -$2 ante.
    const h3 = calculateFlipHoleResult({
      teams: teams1, teamABest: 4, teamBBest: 4,
      effectiveBet: BET, window, holeNumber: 3,
    });
    window = h3.newWindow;
    expect(window.entries).toEqual([{ holeNumber: 3, amount: 10 }]);

    // Hole 4: push at capacity → window: [3:$10, 4:$10]. Still no forfeit.
    const h4 = calculateFlipHoleResult({
      teams: teams1, teamABest: 5, teamBBest: 5,
      effectiveBet: BET, window, holeNumber: 4,
    });
    window = h4.newWindow;
    expect(window.entries).toEqual([
      { holeNumber: 3, amount: 10 },
      { holeNumber: 4, amount: 10 },
    ]);
    expect(window.forfeited).toBe(0);

    // Hole 5: decided with teams1 (teamA 3-man wins). 2-man losers each pay $3. Pot $6. Carry $20.
    // Total pot $26. 3 winners split → $26/3 each.
    const h5 = calculateFlipHoleResult({
      teams: teams1, teamABest: 4, teamBBest: 5,
      effectiveBet: BET, window, holeNumber: 5,
    });
    expect(h5.potFromBet).toBe(6);
    expect(h5.potFromCarry).toBe(20);
    expect(h5.perPlayer.find(p => p.id === "p1")!.amount).toBeCloseTo(26 / 3, 5);
    expect(h5.perPlayer.find(p => p.id === "p4")!.amount).toBe(-3);
  });
});

// ============================================================
// INVARIANT: sum(balances) = -(forfeited + unclaimed_window) at all times
// ============================================================

describe("Flip invariant — Model C accounting ledger", () => {
  it("3 pushes with window=2, B=$2: forfeit $10, every player -$6, window still holds $20", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const BET = 2;
    let window = initRollingCarryWindow(2);
    const balances: Record<string, number> = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 };

    // Play three consecutive pushes.
    for (const holeNumber of [1, 2, 3]) {
      const r = calculateFlipHoleResult({
        teams, teamABest: 4, teamBBest: 4,
        effectiveBet: BET, window, holeNumber,
      });
      expect(r.push).toBe(true);
      window = r.newWindow;
      r.perPlayer.forEach(pp => { balances[pp.id] += pp.amount; });
    }

    // Per-player state after 3 pushes: -$2 ante × 3 = -$6 each.
    expect(balances.p1).toBe(-6);
    expect(balances.p2).toBe(-6);
    expect(balances.p3).toBe(-6);
    expect(balances.p4).toBe(-6);
    expect(balances.p5).toBe(-6);

    // Forfeit = hole 1's $10 pot (evicted on hole 3 push arrival).
    expect(window.forfeited).toBe(10);

    // Unclaimed window = hole 2 + hole 3 = $10 + $10 = $20.
    const unclaimedWindow = window.entries.reduce((a, e) => a + e.amount, 0);
    expect(unclaimedWindow).toBe(20);

    // INVARIANT: sum(balances) = -(forfeit + unclaimed)
    const sumBalances = Object.values(balances).reduce((a, b) => a + b, 0);
    expect(sumBalances).toBe(-30);
    expect(sumBalances).toBe(-(window.forfeited + unclaimedWindow));
  });

  it("3 pushes then decided hole collapses unclaimed window; sum(balances) = -forfeited", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const BET = 2;
    let window = initRollingCarryWindow(2);
    const balances: Record<string, number> = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 };

    // Three pushes to set up the forfeit + window state.
    for (const holeNumber of [1, 2, 3]) {
      const r = calculateFlipHoleResult({
        teams, teamABest: 4, teamBBest: 4,
        effectiveBet: BET, window, holeNumber,
      });
      window = r.newWindow;
      r.perPlayer.forEach(pp => { balances[pp.id] += pp.amount; });
    }

    // Hole 4 decided: teamB (2-man p4,p5) wins. 3-man losers each pay $2. Pot = $6 + $20 = $26. 2 winners split $13 each.
    const h4 = calculateFlipHoleResult({
      teams, teamABest: 6, teamBBest: 4,
      effectiveBet: BET, window, holeNumber: 4,
    });
    window = h4.newWindow;
    h4.perPlayer.forEach(pp => { balances[pp.id] += pp.amount; });

    // Post hole 4 balances:
    //   p1,p2,p3 (3-man losers): -6 + -2 = -$8 each
    //   p4,p5 (2-man winners): -6 + $13 = +$7 each
    expect(balances.p1).toBe(-8);
    expect(balances.p2).toBe(-8);
    expect(balances.p3).toBe(-8);
    expect(balances.p4).toBe(7);
    expect(balances.p5).toBe(7);

    // Window cleared by the decided-hole claim.
    expect(window.entries).toHaveLength(0);
    // Forfeit unchanged by a non-evicting hole.
    expect(window.forfeited).toBe(10);

    // INVARIANT collapses to: sum(balances) = -forfeited
    const sumBalances = Object.values(balances).reduce((a, b) => a + b, 0);
    expect(sumBalances).toBe(-10);
    expect(sumBalances).toBe(-window.forfeited);
  });
});
