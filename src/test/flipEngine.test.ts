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

describe("calculateFlipHoleResult — 3-man team wins", () => {
  it("losers pay B each; 3 winners split the 2B pot → 2B/3 each (B=$3 → $2 each)", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 4, teamBBest: 5, // A (3-man) wins
      effectiveBet: 3, window: initRollingCarryWindow(3), holeNumber: 1,
    });
    expect(r.push).toBe(false);
    expect(r.winningSide).toBe("A");
    // Losers (p4, p5) each pay $3 → pot $6 → winners get $2 each
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(2);
    expect(r.perPlayer.find(p => p.id === "p2")!.amount).toBe(2);
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBe(2);
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(-3);
    expect(r.perPlayer.find(p => p.id === "p5")!.amount).toBe(-3);
    // Sum of all per-player amounts is 0 (closed system, no carry)
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(0);
  });
});

describe("calculateFlipHoleResult — 2-man team wins", () => {
  it("losers pay B each; 2 winners split the 3B pot → 3B/2 each (B=$2 → $3 each)", () => {
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

describe("calculateFlipHoleResult — push", () => {
  it("zero-sum results, appends hole's bet into window", () => {
    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 5, teamBBest: 5,
      effectiveBet: 2, window: initRollingCarryWindow(3), holeNumber: 1,
    });
    expect(r.push).toBe(true);
    expect(r.perPlayer.every(p => p.amount === 0)).toBe(true);
    expect(r.newWindow.entries).toEqual([{ holeNumber: 1, amount: 2 }]);
  });
});

describe("calculateFlipHoleResult — decided hole claims the rolling carry", () => {
  it("winners take baseBet * losers + full window", () => {
    let window = initRollingCarryWindow(3);
    window = appendPushToWindow(window, 1, 2); // $2
    window = appendPushToWindow(window, 2, 2); // $2  (window sum = $4)

    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 4, teamBBest: 5,
      effectiveBet: 2, window, holeNumber: 3,
    });
    // Base pot: 2 losers * $2 = $4. Carry: $4. Total pot: $8. 3 winners → $8/3 each.
    // Cash flow: losers still pay only $2 each (not $8/2) — carry comes from the window, not the losers.
    expect(r.potFromBet).toBe(4);
    expect(r.potFromCarry).toBe(4);
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBeCloseTo(8 / 3, 5);
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(-2);
    expect(r.newWindow.entries).toHaveLength(0); // window cleared
  });
});

describe("calculateFlipHoleResult — forfeit accounting on push that evicts", () => {
  it("push after window full reports the forfeit amount on this hole", () => {
    let window = initRollingCarryWindow(2);
    window = appendPushToWindow(window, 1, 2);
    window = appendPushToWindow(window, 2, 2);
    // Window is full [1:$2, 2:$2]; the next push will evict hole 1's $2.

    const teams = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const r = calculateFlipHoleResult({
      teams, teamABest: 5, teamBBest: 5,
      effectiveBet: 4, window, holeNumber: 3,
    });
    expect(r.push).toBe(true);
    expect(r.forfeitedThisHole).toBe(2);
    expect(r.newWindow.entries).toEqual([
      { holeNumber: 2, amount: 2 },
      { holeNumber: 3, amount: 4 },
    ]);
    expect(r.newWindow.forfeited).toBe(2); // cumulative
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

describe("replayRound equivalence — Flip per-hole teams + rolling window", () => {
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

    // Replay in one pass via replayRound with FlipState + FlipConfig.
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
        { holeNumber: 2, scores: { p1: 5, p2: 4, p3: 4, p4: 5, p5: 5 }, hammerDepth: 0, folded: false }, // B wins (p2,p3)
        { holeNumber: 3, scores: { p1: 4, p2: 5, p3: 5, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // A wins (p1,p2,p4) wait teams3 has teamA=[p2,p3,p5]
      ],
      flipState,
      { baseBet: BET, carryOverWindow: 3 },
    );

    // Hole 1 push: carry [1:$2]
    // Hole 2: teamA=[p1,p4,p5] vs teamB=[p2,p3]. B wins. Pot = 3*$2 + $2 carry = $8. Winners p2,p3 get $4 each.
    // Hole 3: teamA=[p2,p3,p5] vs teamB=[p1,p4]. A wins (p2 shot 5, p5 shot 4, teamA best = 4; teamB best = 4 — tie at 4!).
    // Wait let me recompute. h3 scores: p1=4, p2=5, p3=5, p4=4, p5=4. teamA=[p2,p3,p5] best=4 (p5). teamB=[p1,p4] best=4. Tie → push.
    // Then window: [3:$2].
    // Final totals:
    //   p1: 0 (h1) - 2 (h2 loss) + 0 (h3 push) = -2
    //   p2: 0 + 4 + 0 = 4
    //   p3: 0 + 4 + 0 = 4
    //   p4: 0 - 2 + 0 = -2
    //   p5: 0 - 2 + 0 = -2
    // Sum = -2 + 4 + 4 - 2 - 2 = 2 — NOT zero because $2 stayed in window unclaimed (hole 3 push).
    // That's correct: $2 is still "in the pot" at replay end. Not forfeited (window=3, size 1/3).

    expect(replayed.totals.p1).toBeCloseTo(-2, 5);
    expect(replayed.totals.p2).toBeCloseTo(4, 5);
    expect(replayed.totals.p3).toBeCloseTo(4, 5);
    expect(replayed.totals.p4).toBeCloseTo(-2, 5);
    expect(replayed.totals.p5).toBeCloseTo(-2, 5);
    // Sum = sum of claimed money, which equals $6 claimed - $4 pushed pots = $2 left on board.
    const sum = Object.values(replayed.totals).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(2, 5);
  });
});

describe("Flip scenario integration — rolling window over a 5-hole sequence", () => {
  it("hole 1 push, hole 2 decided, hole 3 push, hole 4 push (window=2), hole 5 decided", () => {
    const teams1 = mkTeams3v2([P[0], P[1], P[2]], [P[3], P[4]]);
    const teams2 = mkTeams3v2([P[0], P[3], P[4]], [P[1], P[2]]);
    const BET = 2;
    let window = initRollingCarryWindow(2);

    // Hole 1: push → window: [1:$2]
    const h1 = calculateFlipHoleResult({
      teams: teams1, teamABest: 4, teamBBest: 4,
      effectiveBet: BET, window, holeNumber: 1,
    });
    window = h1.newWindow;
    expect(window.entries).toEqual([{ holeNumber: 1, amount: 2 }]);

    // Hole 2: teams2 has teamA = [p1, p4, p5] (3-man), teamB = [p2, p3] (2-man). B wins.
    const h2 = calculateFlipHoleResult({
      teams: teams2, teamABest: 5, teamBBest: 4,
      effectiveBet: BET, window, holeNumber: 2,
    });
    // Pot = 3 losers * $2 + $2 carry = $8; 2 winners (p2, p3) get $4 each.
    expect(h2.winningSide).toBe("B");
    expect(h2.potFromBet).toBe(6);
    expect(h2.potFromCarry).toBe(2);
    expect(h2.perPlayer.find(p => p.id === "p2")!.amount).toBe(4);
    expect(h2.perPlayer.find(p => p.id === "p3")!.amount).toBe(4);
    expect(h2.perPlayer.find(p => p.id === "p1")!.amount).toBe(-2);
    expect(h2.perPlayer.find(p => p.id === "p4")!.amount).toBe(-2);
    expect(h2.perPlayer.find(p => p.id === "p5")!.amount).toBe(-2);
    window = h2.newWindow;
    expect(window.entries).toHaveLength(0); // cleared on claim

    // Hole 3: push → window: [3:$2]
    const h3 = calculateFlipHoleResult({
      teams: teams1, teamABest: 4, teamBBest: 4,
      effectiveBet: BET, window, holeNumber: 3,
    });
    window = h3.newWindow;
    expect(window.entries).toEqual([{ holeNumber: 3, amount: 2 }]);

    // Hole 4: push → window: [3:$2, 4:$2]  (at capacity)
    const h4 = calculateFlipHoleResult({
      teams: teams1, teamABest: 5, teamBBest: 5,
      effectiveBet: BET, window, holeNumber: 4,
    });
    window = h4.newWindow;
    expect(window.entries).toEqual([
      { holeNumber: 3, amount: 2 },
      { holeNumber: 4, amount: 2 },
    ]);
    expect(window.forfeited).toBe(0);

    // Hole 5: decided → winners take $2/loser + $4 carry
    const h5 = calculateFlipHoleResult({
      teams: teams1, teamABest: 4, teamBBest: 5,
      effectiveBet: BET, window, holeNumber: 5,
    });
    expect(h5.potFromBet).toBe(4);
    expect(h5.potFromCarry).toBe(4);
    // 3 winners split $8 → 8/3 each
    expect(h5.perPlayer.find(p => p.id === "p1")!.amount).toBeCloseTo(8 / 3, 5);
  });
});
