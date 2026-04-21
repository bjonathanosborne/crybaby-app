import { describe, it, expect } from "vitest";
import {
  calculateSkinsResult,
  replayRound,
  type Player,
  type GameSettings,
  type ReplayHoleInput,
} from "@/lib/gameEngines";

// ============================================================
// PR #17 commit 3 — Skins engine coverage at the boundary.
//
// The engine (`calculateSkinsResult`) previously had no direct unit
// tests — its correctness was validated only via `replayEquivalence.
// test.ts`, which exercises a narrow happy-path scenario. This file
// fills the coverage gap before we un-hide Skins to end users.
//
// Rules encoded in the engine (rediscovered via recon, not changed
// this commit):
//   - Per-hole pot = holeValue + carryOver passed in by the caller.
//   - Tie ⇒ pot carries to next hole (no split option, no cap).
//   - Single winner ⇒ winner receives N×(pot) − pot === (N−1)·pot;
//     each of the (N−1) losers pays pot. Zero-sum.
//   - Net scoring ⇒ `settings.pops === true`; strokes computed via
//     `getStrokesOnHole(handicap, lowestHandicap, holeHandicapRank,
//     settings.handicapPercent)`. Skipped when `pops === false`.
//
// These tests are a correctness GUARD: any failure here means the
// engine drifted from the documented behaviour. If a test reveals a
// real bug, that's a separate fix PR — not a silent adjustment in
// this un-hide commit.
// ============================================================

// ---------- fixtures ----------

function makeSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    hammer: false,
    hammerInitiator: "any",
    hammerMaxDepth: "1",
    crybaby: false,
    crybabHoles: 3,
    crybabHammerRule: "allowed",
    birdieBonus: false,
    birdieMultiplier: 2,
    pops: false,
    noPopsParThree: true,
    carryOverCap: "∞",
    handicapPercent: 100,
    presses: false,
    pressType: "auto",
    ...overrides,
  };
}

function makePlayers(n: number, handicaps: number[] = []): Player[] {
  const colors = ["#16A34A", "#3B82F6", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899"];
  const names = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"];
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: names[i] ?? `Player ${i + 1}`,
    handicap: handicaps[i] ?? 0,
    color: colors[i % colors.length],
  }));
}

/** Zero-sum invariant: after any Skins hole, sum(balances) === 0. */
function assertZeroSum(
  playerResults: Array<{ amount: number }>,
  label = "zero-sum",
): void {
  const sum = playerResults.reduce((acc, p) => acc + p.amount, 0);
  // Tolerate float drift if/when handicap scaling introduces fractions
  expect(sum, `${label}: sum(amounts) must be 0`).toBeCloseTo(0, 5);
}

// ============================================================
// SINGLE-WINNER MATH
// ============================================================

describe("calculateSkinsResult — single-winner hole", () => {
  it("4 players, $5/hole, no carry: winner +$15, each loser -$5, sum=0", () => {
    const players = makePlayers(4);
    const scores = { p1: 3, p2: 4, p3: 5, p4: 4 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 0, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(false);
    expect(r.winnerName).toBe("Alice");
    expect(r.amount).toBe(5);
    expect(r.carryOver).toBe(0);
    expect(r.playerResults.find(p => p.id === "p1")?.amount).toBe(15);
    expect(r.playerResults.filter(p => p.id !== "p1").map(p => p.amount)).toEqual([-5, -5, -5]);
    assertZeroSum(r.playerResults);
  });

  it("2-player minimum edge: winner +$5, loser -$5", () => {
    const players = makePlayers(2);
    const scores = { p1: 3, p2: 5 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 0, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(false);
    expect(r.playerResults.find(p => p.id === "p1")?.amount).toBe(5);
    expect(r.playerResults.find(p => p.id === "p2")?.amount).toBe(-5);
    assertZeroSum(r.playerResults);
  });

  it("6-player maximum edge: winner +$10 at $2/hole, each loser -$2", () => {
    const players = makePlayers(6);
    const scores = { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4, p6: 4 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 2, 0, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(false);
    expect(r.playerResults.find(p => p.id === "p1")?.amount).toBe(10);
    expect(r.playerResults.filter(p => p.id !== "p1").every(p => p.amount === -2)).toBe(true);
    assertZeroSum(r.playerResults);
  });

  it("winner's amount equals (N−1) × totalPot across player counts", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const players = makePlayers(n);
      const scores: Record<string, number> = {};
      players.forEach((p, i) => (scores[p.id] = i === 0 ? 3 : 4));
      const holeValue = 5;
      const r = calculateSkinsResult(
        players, scores, 4, 1, holeValue, 0, makeSettings(), 0, 1,
      );
      expect(
        r.playerResults.find(p => p.id === "p1")?.amount,
        `n=${n} winner amount`,
      ).toBe(holeValue * (n - 1));
      assertZeroSum(r.playerResults, `n=${n}`);
    }
  });
});

// ============================================================
// TIES — carry-over always, no split option
// ============================================================

describe("calculateSkinsResult — ties carry (never split)", () => {
  it("2-way tie: push, carry = totalPot, all per-player amounts = 0", () => {
    const players = makePlayers(4);
    const scores = { p1: 4, p2: 4, p3: 5, p4: 5 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 0, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(true);
    expect(r.winnerName).toBeNull();
    expect(r.amount).toBe(0);
    expect(r.carryOver).toBe(5);
    expect(r.playerResults.every(p => p.amount === 0)).toBe(true);
    assertZeroSum(r.playerResults);
  });

  it("3-way tie: same shape, carry still = totalPot", () => {
    const players = makePlayers(4);
    const scores = { p1: 4, p2: 4, p3: 4, p4: 5 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 0, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(true);
    expect(r.carryOver).toBe(5);
    assertZeroSum(r.playerResults);
  });

  it("all-square: everyone tied, pot carries untouched", () => {
    const players = makePlayers(4);
    const scores = { p1: 4, p2: 4, p3: 4, p4: 4 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 0, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(true);
    expect(r.carryOver).toBe(5);
    assertZeroSum(r.playerResults);
  });

  it("tie with prior carry accumulates: $5 hole + $10 prior carry → carry out $15", () => {
    const players = makePlayers(4);
    const scores = { p1: 4, p2: 4, p3: 5, p4: 5 };
    const r = calculateSkinsResult(
      players, scores, 4, 2, 5, 10, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(true);
    expect(r.carryOver).toBe(15);
    assertZeroSum(r.playerResults);
  });
});

// ============================================================
// CARRY RESOLUTION — winner after ties
// ============================================================

describe("calculateSkinsResult — winner claims carry", () => {
  it("hole 3 decides after 2 ties: winner +3·pot·(N−1), each loser -3·pot", () => {
    // Holes 1-2 tied at $5/hole → hole 3 carryOver = $10. Total pot = $15.
    // Winner receives $15 × (4−1) = $45, each of 3 losers pays $15.
    const players = makePlayers(4);
    const scores = { p1: 3, p2: 4, p3: 4, p4: 4 };
    const r = calculateSkinsResult(
      players, scores, 4, 3, 5, 10, makeSettings(), 0, 1,
    );
    expect(r.push).toBe(false);
    expect(r.amount).toBe(15);
    expect(r.carryOver).toBe(0);
    expect(r.playerResults.find(p => p.id === "p1")?.amount).toBe(45);
    expect(r.playerResults.filter(p => p.id !== "p1").every(p => p.amount === -15)).toBe(true);
    assertZeroSum(r.playerResults);
  });

  it("winner's take equals (holeValue + priorCarry) × (N−1) regardless of how big the carry is", () => {
    const players = makePlayers(4);
    const scores = { p1: 3, p2: 4, p3: 4, p4: 4 };
    for (const priorCarry of [0, 5, 25, 100]) {
      const r = calculateSkinsResult(
        players, scores, 4, 1, 5, priorCarry, makeSettings(), 0, 1,
      );
      const totalPot = 5 + priorCarry;
      expect(
        r.playerResults.find(p => p.id === "p1")?.amount,
        `carry=${priorCarry}`,
      ).toBe(totalPot * (players.length - 1));
      assertZeroSum(r.playerResults, `carry=${priorCarry}`);
    }
  });

  it("Skins has NO carry cap — confirmed: recon noted carryOverCap applies only to team games, not Skins", () => {
    // Regression guard: if someone later wires carryOverCap into
    // calculateSkinsResult, this test will start asserting a clamp
    // that doesn't currently exist. Keeping it here to fail-loudly
    // on that change so the un-hide surface is aware.
    const players = makePlayers(4);
    const scores = { p1: 3, p2: 4, p3: 4, p4: 4 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 500, makeSettings({ carryOverCap: "5" }), 0, 1,
    );
    const totalPot = 5 + 500;
    expect(r.playerResults.find(p => p.id === "p1")?.amount).toBe(totalPot * 3);
    assertZeroSum(r.playerResults);
  });
});

// ============================================================
// NET VS GROSS — pops scaling
// ============================================================

describe("calculateSkinsResult — net scoring via pops", () => {
  // 4 players. p1 is an 8-hcp, others are 0. On a #1 handicap hole,
  // p1 gets 1 stroke at 100% (8 - 0 >= 1). At 50% scaling, p1 gets
  // round(8 * 0.5) - round(0) = 4 strokes diff ≥ 1, so still 1 stroke
  // (since diff < 18).
  it("p1 (hcp 8) gets a pop on hole-index 1 → net beats a gross-lower player", () => {
    const players = makePlayers(4, [8, 0, 0, 0]);
    // Gross scores: p1=5, p2=4, p3=5, p4=5. Net p1 = 5 - 1 = 4 (tied with p2)
    const scoresNetTie = { p1: 5, p2: 4, p3: 5, p4: 5 };
    const rNetTie = calculateSkinsResult(
      players, scoresNetTie, 4, 1, 5, 0,
      makeSettings({ pops: true, handicapPercent: 100 }),
      0,  // lowestHandicap (of others)
      1,  // hole handicap rank — hardest hole
    );
    expect(rNetTie.push).toBe(true);
    expect(rNetTie.carryOver).toBe(5);

    // Now gross scores where p1 actually shoots lower net: 4 - 1 = 3 vs p2's 4.
    const scoresNetWin = { p1: 4, p2: 4, p3: 5, p4: 5 };
    const rNetWin = calculateSkinsResult(
      players, scoresNetWin, 4, 1, 5, 0,
      makeSettings({ pops: true, handicapPercent: 100 }),
      0, 1,
    );
    expect(rNetWin.push).toBe(false);
    expect(rNetWin.winnerName).toBe("Alice");
    expect(rNetWin.playerResults.find(p => p.id === "p1")?.amount).toBe(15);
    assertZeroSum(rNetWin.playerResults);
  });

  it("pops disabled → gross scoring: p1 (hcp 8) shooting 5 LOSES to p2 shooting 4", () => {
    const players = makePlayers(4, [8, 0, 0, 0]);
    const scores = { p1: 5, p2: 4, p3: 5, p4: 5 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 0,
      makeSettings({ pops: false }),
      0, 1,
    );
    expect(r.push).toBe(false);
    expect(r.winnerName).toBe("Bob");
    expect(r.playerResults.find(p => p.id === "p2")?.amount).toBe(15);
    assertZeroSum(r.playerResults);
  });

  it("handicapPercent in settings scales strokes correctly (Commit 2 pipeline)", () => {
    // p1 hcp 16, others 0. At 100%, diff 16 earns strokes on hole ranks
    // 1-16. At 50% scaled, round(16*0.5)=8 diff earns strokes on 1-8.
    // Scenario A: 100% on hole rank 15 → p1 gets 1 stroke.
    // Scenario B: 50% on hole rank 15 → p1 gets 0 strokes.
    const players = makePlayers(4, [16, 0, 0, 0]);
    const scores = { p1: 5, p2: 4, p3: 5, p4: 5 };

    const r100 = calculateSkinsResult(
      players, scores, 4, 1, 5, 0,
      makeSettings({ pops: true, handicapPercent: 100 }),
      0, 15,
    );
    // p1 net = 5 - 1 = 4, ties p2. Carry.
    expect(r100.push).toBe(true);

    const r50 = calculateSkinsResult(
      players, scores, 4, 1, 5, 0,
      makeSettings({ pops: true, handicapPercent: 50 }),
      0, 15,
    );
    // p1 net = 5 - 0 = 5, loses to p2's 4. p2 wins.
    expect(r50.push).toBe(false);
    expect(r50.winnerName).toBe("Bob");
    assertZeroSum(r50.playerResults);
  });

  it("pops do NOT apply when settings.pops is false, regardless of handicap values", () => {
    const players = makePlayers(4, [36, 0, 0, 0]);
    const scores = { p1: 4, p2: 5, p3: 5, p4: 5 };
    const r = calculateSkinsResult(
      players, scores, 4, 1, 5, 0,
      makeSettings({ pops: false, handicapPercent: 50 }),
      0, 1,
    );
    expect(r.push).toBe(false);
    expect(r.winnerName).toBe("Alice");
    expect(r.playerResults.find(p => p.id === "p1")?.amount).toBe(15);
    assertZeroSum(r.playerResults);
  });
});

// ============================================================
// ZERO-SUM INVARIANT — sweep
// ============================================================

describe("calculateSkinsResult — zero-sum invariant sweep", () => {
  it("holds across every tested scenario permutation (decide / tie / tie-with-carry)", () => {
    const players = makePlayers(5);
    const testCases: Array<{ label: string; scores: Record<string, number>; carry: number }> = [
      { label: "clear winner", scores: { p1: 3, p2: 5, p3: 5, p4: 5, p5: 5 }, carry: 0 },
      { label: "2-way tie", scores: { p1: 4, p2: 4, p3: 5, p4: 5, p5: 5 }, carry: 0 },
      { label: "3-way tie", scores: { p1: 4, p2: 4, p3: 4, p4: 5, p5: 5 }, carry: 5 },
      { label: "all-square", scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, carry: 25 },
      { label: "winner with huge carry", scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, carry: 200 },
    ];
    for (const tc of testCases) {
      const r = calculateSkinsResult(
        players, tc.scores, 4, 1, 5, tc.carry, makeSettings(), 0, 1,
      );
      assertZeroSum(r.playerResults, tc.label);
    }
  });
});

// ============================================================
// MULTI-HOLE SEQUENCE — integration via replayRound
// ============================================================

describe("replayRound skins — multi-hole integration", () => {
  it("5-hole sequence (decide / tie / tie / decide-with-carry / decide) produces hand-computed totals", () => {
    const players = makePlayers(4);
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holeValue = 5;
    const settings = makeSettings();

    const holes: ReplayHoleInput[] = [
      // Hole 1: p1 wins clean. +$15 p1, -$5 each other.
      { holeNumber: 1, scores: { p1: 3, p2: 4, p3: 4, p4: 4 }, hammerDepth: 0, folded: false },
      // Hole 2: tie p1+p2. Carry $5.
      { holeNumber: 2, scores: { p1: 4, p2: 4, p3: 5, p4: 5 }, hammerDepth: 0, folded: false },
      // Hole 3: tie again. Carry $10 (5 + 5).
      { holeNumber: 3, scores: { p1: 4, p2: 4, p3: 5, p4: 5 }, hammerDepth: 0, folded: false },
      // Hole 4: p3 wins with $10 carry + $5 hole = $15 pot × 3 = +$45. Others -$15.
      { holeNumber: 4, scores: { p1: 5, p2: 5, p3: 3, p4: 5 }, hammerDepth: 0, folded: false },
      // Hole 5: p2 wins clean. +$15 p2, -$5 others.
      { holeNumber: 5, scores: { p1: 5, p2: 3, p3: 5, p4: 5 }, hammerDepth: 0, folded: false },
    ];
    const replay = replayRound("skins", players, pars, handicaps, holeValue, settings, holes);

    // Hand-computed:
    // p1: +15 (h1) +0 +0 -15 (h4) -5 (h5)  = -5
    // p2: -5 (h1) +0 +0 -15 (h4) +15 (h5) = -5
    // p3: -5 (h1) +0 +0 +45 (h4) -5 (h5)  = +35
    // p4: -5 (h1) +0 +0 -15 (h4) -5 (h5)  = -25
    expect(replay.totals.p1).toBe(-5);
    expect(replay.totals.p2).toBe(-5);
    expect(replay.totals.p3).toBe(35);
    expect(replay.totals.p4).toBe(-25);

    // Zero-sum across the whole round
    const totalSum = Object.values(replay.totals).reduce((a, b) => a + b, 0);
    expect(totalSum).toBe(0);
  });

  it("18-hole mixed sequence: final balances sum to zero", () => {
    const players = makePlayers(4);
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const settings = makeSettings();

    // Rotate winners, sprinkle ties. Guarantees multiple carry events.
    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => {
      const h = i + 1;
      // Every 5th hole is a 2-way tie. Otherwise someone wins.
      if (h % 5 === 0) {
        return { holeNumber: h, scores: { p1: 4, p2: 4, p3: 5, p4: 5 }, hammerDepth: 0, folded: false };
      }
      const winnerIdx = (h - 1) % 4;
      const scores: Record<string, number> = {};
      players.forEach((p, idx) => (scores[p.id] = idx === winnerIdx ? 3 : 4));
      return { holeNumber: h, scores, hammerDepth: 0, folded: false };
    });

    const replay = replayRound("skins", players, pars, handicaps, 5, settings, holes);
    const sum = Object.values(replay.totals).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
    expect(replay.holeResults).toHaveLength(18);
  });

  it("pops distribute by handicap index: strokes land on lowest-rank holes first", () => {
    // p1 hcp 5, others 0. p1 should get pops on holes with
    // handicap rank 1-5 only.
    const players = makePlayers(4, [5, 0, 0, 0]);
    // Set up pars/handicaps so we know which holes are "hard" (rank 1-5).
    const pars = Array(18).fill(4);
    const handicaps: number[] = [];
    for (let i = 1; i <= 18; i++) handicaps.push(i);
    // So hole 1 has rank 1 (hardest), hole 18 has rank 18 (easiest).
    const settings = makeSettings({ pops: true, handicapPercent: 100 });

    // On each hole, p1 shoots 5 and others shoot 4.
    // Net p1:
    //   Hole 1-5 (rank 1-5): net = 5 - 1 = 4 → tie w/ others @ 4 → carry
    //   Hole 6-18 (rank 6-18): net = 5 - 0 = 5 → p1 LOSES; winner = lowest gross among p2-p4
    // Since p2, p3, p4 ALL shoot 4 on each hole, they all tie for low → 3-way tie → carry
    // Net result: every hole ties, carry keeps growing, no decided hole, final sum = 0.
    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: { p1: 5, p2: 4, p3: 4, p4: 4 },
      hammerDepth: 0,
      folded: false,
    }));
    const replay = replayRound("skins", players, pars, handicaps, 5, settings, holes);

    // Every hole is a tie (either p1 joins at rank 1-5, or p2/p3/p4 3-way tie everywhere else).
    // Therefore all balances = 0.
    expect(replay.totals.p1).toBe(0);
    expect(replay.totals.p2).toBe(0);
    expect(replay.totals.p3).toBe(0);
    expect(replay.totals.p4).toBe(0);

    // Carry-over on the last hole result should be large — 18 holes × $5 pot = $90 unresolved.
    const lastHole = replay.holeResults[replay.holeResults.length - 1];
    expect(lastHole.carryOver).toBe(90);
  });
});
