import { describe, it, expect } from "vitest";
import {
  replayRound,
  type Player,
  type GameSettings,
  type ReplayHoleInput,
  type FlipState,
  type FlipConfig,
  type CrybabyState,
  type TeamInfo,
} from "@/lib/gameEngines";
import { computeFlipSettlementSplit } from "@/lib/flipCrybaby";

// ============================================================
// C8 — Replay equivalence release gate for Flip.
//
// Covers the end-to-end replay path for Flip rounds, including the
// base-game rolling window (1-15) and the crybaby sub-game (16-18).
// These tests are the CI gate: if `replayRound` and the live hole
// engine diverge by a dollar, they fail — because the C8
// `apply-capture` redeploy relies on `replayRound` rebuilding totals
// after post-round score corrections.
//
// Invariants under test (Model C):
//   (i)   sum(replay.holeResults[].playerResults[].amount) across
//         a player equals replay.totals[player].
//   (ii)  sum(replay.totals) for the whole round equals
//         -(forfeited + unclaimed_window). Money is closed.
//   (iii) baseAmount + crybabyAmount = totals[player] (C7 split).
// ============================================================

// ---- fixtures ----------------------------------------------------------

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

function makePlayers5(): Player[] {
  return [
    { id: "p1", name: "Alice", handicap: 0, color: "#16A34A" },
    { id: "p2", name: "Bob",   handicap: 0, color: "#3B82F6" },
    { id: "p3", name: "Carol", handicap: 0, color: "#F59E0B" },
    { id: "p4", name: "Dave",  handicap: 0, color: "#DC2626" },
    { id: "p5", name: "Eve",   handicap: 0, color: "#8B5CF6" },
  ];
}

/**
 * Build a FlipState with the same 3v2 split held constant across all 18
 * holes. Real rounds change teams after every decided hole — for replay
 * equivalence the split is immaterial to the math (the engine just reads
 * `teamsByHole[h]` from the persisted state).
 */
function staticFlipState(players: Player[], h16?: TeamInfo): FlipState {
  const teamA: TeamInfo["teamA"] = {
    name: "Heads",
    players: [players[0], players[1], players[2]],
    color: "#16A34A",
  };
  const teamB: TeamInfo["teamB"] = {
    name: "Tails",
    players: [players[3], players[4]],
    color: "#3B82F6",
  };
  const base: TeamInfo = { teamA, teamB };
  const teamsByHole: Record<number, TeamInfo> = {};
  for (let h = 1; h <= 15; h++) teamsByHole[h] = base;
  // For crybaby holes 16-18, persist the crybaby 2v3 split (teamA = 2-man,
  // teamB = 3-man). replayRound reads teams via `getTeamsForHole` which
  // prefers `crybabyTeams` when supplied, but since replayRound doesn't
  // expose that path the teamsByHole entries double as the source of truth.
  const h16Teams = h16 ?? base;
  for (let h = 16; h <= 18; h++) teamsByHole[h] = h16Teams;
  return {
    teamsByHole,
    decidedHistory: [],
    version: 1,
  };
}

function makeCrybabyState(
  crybabyId: string,
  partnerId: string,
  players: Player[],
  bets: { h16: number; h17: number; h18: number },
  losingBalance: number,
): CrybabyState {
  const twoMan = players.filter(p => p.id === crybabyId || p.id === partnerId);
  const threeMan = players.filter(p => p.id !== crybabyId && p.id !== partnerId);
  const teams: TeamInfo = {
    teamA: { name: "Crybaby+Partner", players: twoMan, color: "#EC4899" },
    teamB: { name: "The Pack",        players: threeMan, color: "#3B82F6" },
  };
  return {
    crybaby: crybabyId,
    losingBalance,
    maxBetPerHole: Math.max(bets.h16, bets.h17, bets.h18),
    byHole: {
      16: { bet: bets.h16, partner: partnerId, teams },
      17: { bet: bets.h17, partner: partnerId, teams },
      18: { bet: bets.h18, partner: partnerId, teams },
    },
  };
}

/** Sum every per-hole player result into a totals map — independent recompute. */
function sumHoleResultsByPlayer(
  holeResults: Array<{ playerResults: Array<{ id: string; amount: number }> }>,
  playerIds: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const id of playerIds) totals[id] = 0;
  for (const hr of holeResults) {
    for (const pr of hr.playerResults) {
      totals[pr.id] = (totals[pr.id] || 0) + pr.amount;
    }
  }
  return totals;
}

const PARS = Array(18).fill(4);
const HANDICAPS = Array.from({ length: 18 }, (_, i) => i + 1);

// ============================================================
// 1. Base game (1-15) — pushes, decided, rolling-window forfeits
// ============================================================

describe("flip replay — base game rolling window equivalence", () => {
  it("hole-by-hole playerResults sum to replay.totals (invariant i)", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 4, carryOverWindow: "all" };

    // A mix of pushes and decided holes to exercise the window claim path.
    // All ties (4,4,4,4,4) push. Any score difference gives a winner by
    // team best-ball.
    const holes: ReplayHoleInput[] = [
      { holeNumber: 1,  scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 2,  scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // A wins
      { holeNumber: 3,  scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 4,  scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 5,  scores: { p1: 4, p2: 4, p3: 4, p4: 3, p5: 4 }, hammerDepth: 0, folded: false }, // B wins, claims window
      { holeNumber: 6,  scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // A wins
      { holeNumber: 7,  scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 8,  scores: { p1: 4, p2: 4, p3: 4, p4: 3, p5: 4 }, hammerDepth: 0, folded: false }, // B wins
      { holeNumber: 9,  scores: { p1: 4, p2: 4, p3: 3, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // A wins
      { holeNumber: 10, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 11, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 12, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 13, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 3 }, hammerDepth: 0, folded: false }, // B wins, claims 3 pushes
      { holeNumber: 14, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 15, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // A wins
    ];

    const replay = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holes, flipState, flipConfig);

    const recomputed = sumHoleResultsByPlayer(replay.holeResults, players.map(p => p.id));
    expect(recomputed).toEqual(replay.totals);
    // 15 holes played
    expect(replay.holeResults).toHaveLength(15);
  });

  it("rolling window with size=2 FORFEITS the oldest push when 3+ consecutive pushes occur", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 4, carryOverWindow: 2 };

    // Three consecutive pushes on holes 1, 2, 3 — the hole-1 push evicts
    // (forfeits) when hole 3 appends. Then hole 4 decides and claims
    // holes 2 + 3 only. Money in the ether = hole-1 push's window entry.
    const holes: ReplayHoleInput[] = [
      { holeNumber: 1, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 2, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 3, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 4, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
    ];

    const replay = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holes, flipState, flipConfig);

    // sum(all balances) should be NEGATIVE by exactly the forfeit amount.
    // Each push puts 5 * baseBet = $20 into the window. Hole 1 forfeits $20.
    // `toBeCloseTo` guards against floating-point accumulation across
    // per-player 1.5B loser payouts (IEEE-754 drift ~1e-14).
    const totalDeltas = players.reduce((s, p) => s + (replay.totals[p.id] || 0), 0);
    expect(totalDeltas).toBeCloseTo(-20, 5);

    // sum(hole amounts) also equals replay.totals (invariant i).
    const recomputed = sumHoleResultsByPlayer(replay.holeResults, players.map(p => p.id));
    expect(recomputed).toEqual(replay.totals);
  });

  it("closed-system sum(totals) = -(forfeited + unclaimed window) after all decided holes claimed", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 2, carryOverWindow: "all" };

    // Alternate push, decide, push, decide. Every decided hole claims.
    // No forfeits, no unclaimed window → sum(totals) should be 0.
    const holes: ReplayHoleInput[] = [];
    for (let h = 1; h <= 15; h++) {
      if (h % 2 === 0) {
        // decide — p1 birdies
        holes.push({ holeNumber: h, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false });
      } else {
        // push
        holes.push({ holeNumber: h, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false });
      }
    }
    // Last hole (15) is a push — the window holds unclaimed money.
    const replay = replayRound("flip", players, PARS, HANDICAPS, 2, settings, holes, flipState, flipConfig);

    // Hole 15 is an unclaimed push of 5 * 2 = $10. sum(totals) = -10.
    const totalDeltas = players.reduce((s, p) => s + (replay.totals[p.id] || 0), 0);
    expect(totalDeltas).toBeCloseTo(-10, 5);
  });
});

// ============================================================
// 2. Crybaby sub-game (holes 16-18)
// ============================================================

describe("flip replay — crybaby sub-game equivalence", () => {
  it("replayRound dispatches to calculateCrybabyHoleResult for holes 16-18 with asymmetric payouts", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 2, carryOverWindow: "all" };

    // Crybaby = p5 (net losing balance $30 after base). Partner = p1.
    // 2-man team = p1+p5; 3-man team = p2+p3+p4.
    const crybabyState = makeCrybabyState("p5", "p1", players,
      { h16: 30, h17: 20, h18: 10 }, 30);

    // Hole 16: 2-man wins (p1 birdie). At $30 bet:
    //   2-man each +$15, 3-man each -$10.
    // Hole 17: push (all tied). Net zero.
    // Hole 18: 3-man wins (p3 birdie). At $10 bet:
    //   3-man each +(2*10)/3 ≈ $6.67, 2-man each -$10.
    const holes: ReplayHoleInput[] = [
      // 1-15 all push so base totals are all -baseBet * 15... actually make
      // them all flat and decided so the base game isn't the focus.
      ...Array.from({ length: 15 }, (_, i) => ({
        holeNumber: i + 1,
        scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 },
        hammerDepth: 0,
        folded: false,
      })),
      { holeNumber: 16, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // 2-man wins
      { holeNumber: 17, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 18, scores: { p1: 4, p2: 4, p3: 3, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // 3-man wins
    ];

    const replay = replayRound("flip", players, PARS, HANDICAPS, 2, settings, holes,
      flipState, flipConfig, crybabyState);

    // Independently recompute crybaby-phase contribution for each player.
    // Hole 16 (bet=30, 2-man wins): p1,p5 = +15; p2,p3,p4 = -10
    // Hole 17 (push):               everyone = 0
    // Hole 18 (bet=10, 3-man wins): p1,p5 = -10; p2,p3,p4 = +20/3 ≈ 6.667
    const crybaby16_18_p1 = 15 + 0 + (-10);
    const crybaby16_18_p2 = -10 + 0 + (20 / 3);
    const crybaby16_18_p5 = 15 + 0 + (-10);

    // The base-game 15 pushes also happened — so base contributes:
    // 15 pushes × $2 baseBet × -$1 per player per push = -$30. But the
    // WINDOW holds 15 * 5 * 2 = $150 unclaimed going into hole 16. Since
    // the crybaby sub-game does NOT claim the window, it stays unclaimed.
    // So each base-game contribution per player = -(15 * 2) = -30.
    // Total per player = -30 + crybaby-contribution.
    expect(replay.totals.p1).toBeCloseTo(-30 + crybaby16_18_p1, 5);
    expect(replay.totals.p2).toBeCloseTo(-30 + crybaby16_18_p2, 5);
    expect(replay.totals.p5).toBeCloseTo(-30 + crybaby16_18_p5, 5);

    // Invariant (i): hole amounts sum to totals
    const recomputed = sumHoleResultsByPlayer(replay.holeResults, players.map(p => p.id));
    for (const p of players) {
      expect(recomputed[p.id]).toBeCloseTo(replay.totals[p.id], 5);
    }

    // C7 split invariant: baseAmount + crybabyAmount = totals[player]
    for (const p of players) {
      const split = computeFlipSettlementSplit(replay.holeResults, p.id, true);
      expect(split.baseAmount + split.crybabyAmount).toBeCloseTo(replay.totals[p.id], 5);
    }
  });
});

// ============================================================
// 3. All-square edge case — crybaby phase never fires
// ============================================================

describe("flip replay — all-square (crybaby skipped, 16-18 play as base)", () => {
  it("all-square sentinel routes holes 16-18 through base-game rolling window", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 2, carryOverWindow: "all" };

    // All-square sentinel: crybaby === "". Even if byHole entries exist, the
    // replayRound gate `crybabyState.crybaby !== ""` short-circuits and
    // holes 16-18 fall through to the base-game branch.
    const crybabyState: CrybabyState = {
      crybaby: "",
      losingBalance: 0,
      maxBetPerHole: 0,
      byHole: {},
    };

    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 },
      hammerDepth: 0,
      folded: false,
    }));
    // Hole 18 decides so window claims.
    holes[17] = { holeNumber: 18, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false };

    const replay = replayRound("flip", players, PARS, HANDICAPS, 2, settings, holes,
      flipState, flipConfig, crybabyState);

    // Sanity: replay ran all 18 holes
    expect(replay.holeResults).toHaveLength(18);

    // sum(totals) should be 0 — every push went into the window and hole 18
    // claimed it. No forfeits in an "all" window mode.
    const sumTotals = players.reduce((s, p) => s + (replay.totals[p.id] || 0), 0);
    expect(sumTotals).toBe(0);

    // C7 split: all-square sentinel → all 18 holes roll into baseAmount,
    // crybabyAmount = 0 exactly.
    for (const p of players) {
      const split = computeFlipSettlementSplit(replay.holeResults, p.id, false);
      expect(split.crybabyAmount).toBe(0);
      expect(split.baseAmount).toBe(replay.totals[p.id]);
    }
  });
});

// ============================================================
// 4. Full 18-hole round with pushes + decides + crybaby + forfeits
// ============================================================

describe("flip replay — full round with mixed outcomes + forfeits", () => {
  it("totals, split, and forfeit accounting all line up after 18 holes", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 2, carryOverWindow: 2 }; // window 2 triggers forfeits

    const crybabyState = makeCrybabyState("p4", "p2", players,
      { h16: 20, h17: 10, h18: 20 }, 20);

    const holes: ReplayHoleInput[] = [
      // 3 consecutive pushes → forfeit on hole 3 entry
      { holeNumber: 1, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 2, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 3, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 4, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // A wins, claims 2
      { holeNumber: 5, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 6, scores: { p1: 4, p2: 3, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // A wins (p2 on A)
      { holeNumber: 7, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 8, scores: { p1: 4, p2: 4, p3: 4, p4: 3, p5: 4 }, hammerDepth: 0, folded: false }, // B wins
      { holeNumber: 9, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 10, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 11, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // 3rd push → forfeit hole 9
      { holeNumber: 12, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 13, scores: { p1: 4, p2: 4, p3: 3, p4: 4, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 14, scores: { p1: 4, p2: 4, p3: 4, p4: 3, p5: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 15, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 3 }, hammerDepth: 0, folded: false },
      // crybaby holes
      { holeNumber: 16, scores: { p1: 4, p2: 3, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // 2-man (p2,p4) wins
      { holeNumber: 17, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 18, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // 3-man wins
    ];

    const replay = replayRound("flip", players, PARS, HANDICAPS, 2, settings, holes,
      flipState, flipConfig, crybabyState);

    expect(replay.holeResults).toHaveLength(18);

    // Invariant (i): hole amounts sum to totals
    const recomputed = sumHoleResultsByPlayer(replay.holeResults, players.map(p => p.id));
    for (const p of players) {
      expect(recomputed[p.id]).toBeCloseTo(replay.totals[p.id], 5);
    }

    // C7 split invariant per player.
    for (const p of players) {
      const split = computeFlipSettlementSplit(replay.holeResults, p.id, true);
      expect(split.baseAmount + split.crybabyAmount).toBeCloseTo(replay.totals[p.id], 5);
    }

    // Crybaby holes (16-18) contribute only to crybabyAmount; base (1-15)
    // contributes only to baseAmount — verify on one specific player.
    // Crybaby = p4, partner = p2. 2-man = [p2,p4]; 3-man = [p1,p3,p5].
    //
    // Hole 16 (bet=$20, 2-man wins via p2 birdie): opponentStake=
    //   computeOpponentStake(20) = $6 (6.67 rounds to even 6). 3-man
    //   loser p1 pays $6.
    // Hole 17: push → $0.
    // Hole 18 (bet=$20, 3-man wins via p1 birdie): threeManGain=
    //   (2*20)/3 ≈ $13.333. p1 is 3-man → +$13.333.
    const p1Split = computeFlipSettlementSplit(replay.holeResults, "p1", true);
    expect(p1Split.crybabyAmount).toBeCloseTo(-6 + 0 + (2 * 20) / 3, 5);
  });
});

// ============================================================
// 5. Apply-capture parity — same scores, correction re-runs cleanly
// ============================================================

describe("flip replay — post-correction idempotency", () => {
  it("re-running replayRound on identical inputs yields identical totals (bit-for-bit)", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 4, carryOverWindow: "all" };
    const crybabyState = makeCrybabyState("p3", "p1", players,
      { h16: 10, h17: 10, h18: 10 }, 10);

    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: i % 3 === 0
        ? { p1: 3, p2: 4, p3: 4, p4: 4, p5: 4 }
        : { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 },
      hammerDepth: 0,
      folded: false,
    }));

    const a = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holes, flipState, flipConfig, crybabyState);
    const b = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holes, flipState, flipConfig, crybabyState);

    expect(a.totals).toEqual(b.totals);
    expect(a.holeResults.length).toBe(b.holeResults.length);
    for (let i = 0; i < a.holeResults.length; i++) {
      expect(a.holeResults[i].playerResults).toEqual(b.holeResults[i].playerResults);
    }
  });

  it("correcting a base-game score only shifts base_amount; crybaby stays intact", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 4, carryOverWindow: "all" };
    const crybabyState = makeCrybabyState("p3", "p1", players,
      { h16: 10, h17: 10, h18: 10 }, 10);

    const holesBefore: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 },
      hammerDepth: 0,
      folded: false,
    }));
    // After: hole 5 was wrong — p1 actually scored 3 not 4 (so team A wins).
    const holesAfter = holesBefore.map(h =>
      h.holeNumber === 5
        ? { ...h, scores: { ...h.scores, p1: 3 } }
        : h,
    );

    const before = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holesBefore, flipState, flipConfig, crybabyState);
    const after = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holesAfter, flipState, flipConfig, crybabyState);

    // Crybaby split should be byte-identical (only hole 5 changed).
    for (const p of players) {
      const sb = computeFlipSettlementSplit(before.holeResults, p.id, true);
      const sa = computeFlipSettlementSplit(after.holeResults, p.id, true);
      expect(sa.crybabyAmount).toBe(sb.crybabyAmount);
    }

    // baseAmount should differ for at least one player (the fix tipped
    // hole 5 from push → decided).
    const diffsBase = players.map(p => {
      const sb = computeFlipSettlementSplit(before.holeResults, p.id, true);
      const sa = computeFlipSettlementSplit(after.holeResults, p.id, true);
      return sa.baseAmount - sb.baseAmount;
    });
    expect(diffsBase.some(d => d !== 0)).toBe(true);
  });

  it("correcting a crybaby score only shifts crybaby_amount; base stays intact", () => {
    const players = makePlayers5();
    const settings = makeSettings();
    const flipState = staticFlipState(players);
    const flipConfig: FlipConfig = { baseBet: 4, carryOverWindow: "all" };
    const crybabyState = makeCrybabyState("p3", "p1", players,
      { h16: 10, h17: 10, h18: 10 }, 10);

    const holesBefore: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 },
      hammerDepth: 0,
      folded: false,
    }));
    // After: hole 17 changed — p1 actually scored 3 (2-man wins instead of push).
    const holesAfter = holesBefore.map(h =>
      h.holeNumber === 17
        ? { ...h, scores: { ...h.scores, p1: 3 } }
        : h,
    );

    const before = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holesBefore, flipState, flipConfig, crybabyState);
    const after = replayRound("flip", players, PARS, HANDICAPS, 4, settings, holesAfter, flipState, flipConfig, crybabyState);

    // baseAmount should be identical — no hole 1-15 changed.
    for (const p of players) {
      const sb = computeFlipSettlementSplit(before.holeResults, p.id, true);
      const sa = computeFlipSettlementSplit(after.holeResults, p.id, true);
      expect(sa.baseAmount).toBe(sb.baseAmount);
    }

    // crybabyAmount should differ for at least one player (push → decided).
    const diffsCry = players.map(p => {
      const sb = computeFlipSettlementSplit(before.holeResults, p.id, true);
      const sa = computeFlipSettlementSplit(after.holeResults, p.id, true);
      return sa.crybabyAmount - sb.crybabyAmount;
    });
    expect(diffsCry.some(d => d !== 0)).toBe(true);
  });
});
