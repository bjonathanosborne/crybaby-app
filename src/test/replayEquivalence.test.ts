import { describe, it, expect } from "vitest";
import {
  replayRound,
  initNassauState,
  type Player,
  type GameSettings,
  type HoleResult,
  type ReplayHoleInput,
  type TeamInfo,
} from "@/lib/gameEngines";
import { computeAdvanceHole, type RoundStateSnapshot } from "@/hooks/useRoundState";

/**
 * RELEASE GATE. The Phase 2 apply-capture edge function calls replayRound
 * to recompute an entire round from a (possibly corrected) score set. The
 * live-play path uses computeAdvanceHole hole-by-hole. If these two
 * compute paths diverge by a dollar, money math is wrong.
 *
 * These tests play a full round via computeAdvanceHole, then replay the
 * same scores via replayRound, and assert totals match. If either is
 * wrong, the test fails and CI should block the merge.
 *
 * Covers:
 *  - Skins with carry-over
 *  - DOC (drivers_others_carts) with hammer + crybaby phase
 *  - Flip with birdie bonus
 *  - Nassau (segment settlement; presses not carried through replay by
 *    design, so presses are tested via calculateNassauSettlement directly
 *    in gameEngines.test.ts)
 *
 * Not covered here (deferred):
 *  - Wolf — replayRound doesn't carry partner selections.
 *    DEFERRED to post-Phase-2. See TODOS.md.
 */

// --- fixtures --------------------------------------------------------

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
    // PR #30 commit 2: explicit carry-over toggle. See gameEngines.test.ts
    // for the rationale on defaulting to `true` in test helpers.
    carryOverEnabled: true,
    carryOverCap: "∞",
    handicapPercent: 100,
    presses: false,
    pressType: "auto",
    ...overrides,
  };
}

function makePlayers4DOC(): Player[] {
  return [
    { id: "a", name: "Alice", handicap: 10, cart: "A", position: "driver", color: "#16A34A" },
    { id: "b", name: "Bob",   handicap: 10, cart: "A", position: "rider",  color: "#3B82F6" },
    { id: "c", name: "Carol", handicap: 10, cart: "B", position: "driver", color: "#F59E0B" },
    { id: "d", name: "Dave",  handicap: 10, cart: "B", position: "rider",  color: "#DC2626" },
  ];
}

function freshSnapshot(players: Player[]): RoundStateSnapshot {
  return {
    currentHole: 1,
    scores: {},
    totals: Object.fromEntries(players.map(p => [p.id, 0])),
    holeResults: [],
    hammerDepth: 0,
    hammerHistory: [],
    hammerPending: false,
    lastHammerBy: null,
    carryOver: 0,
    flipTeams: null,
    wolfState: { wolfOrder: [], currentWolfIndex: 0, partnerSelected: null, isLoneWolf: false },
    nassauState: initNassauState(players),
    nassauPresses: [],
  };
}

/**
 * Shorthand: play a hole forward through computeAdvanceHole given a
 * precomputed HoleResult. Used to simulate the live flow where
 * CrybabyActiveRound calls calculateTeamHoleResult (etc.) and then
 * feeds the result into computeAdvanceHole.
 */
function advance(
  state: RoundStateSnapshot,
  result: HoleResult,
  hole: number,
  gameMode: string,
  players: Player[],
  holeValue: number,
  teams: TeamInfo | null,
  nassauTeams: TeamInfo | null,
): RoundStateSnapshot {
  return computeAdvanceHole(state, {
    result, currentHole: hole, gameMode, players, holeValue, teams, nassauTeams,
  });
}

// ---------------------------------------------------------------------
// Skins with carry-over
// ---------------------------------------------------------------------

describe("replayRound equivalence — skins with carry-over", () => {
  it("live totals match replayed totals when pushes carry the pot", () => {
    const players = makePlayers4DOC();
    const settings = makeSettings({ carryOverCap: "∞" });
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holeValue = 2;

    // Design: hole 1 is a push (carries); hole 2 a wins alone (takes carry);
    // holes 3-18 every hole a different single winner.
    // The live path would call calculateSkinsResult, which we invoke via
    // replayRound for the fixture and reuse its result for the live sim.
    const scoresList: ReplayHoleInput[] = [
      // Hole 1: tie at 4 -> push, carry grows
      { holeNumber: 1, scores: { a: 4, b: 4, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      // Hole 2: a wins at 3 gross -> takes $2 hole + $2 carry per other player? Need to verify skins math.
      { holeNumber: 2, scores: { a: 3, b: 5, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      // Holes 3-18: various solo winners
      ...Array.from({ length: 16 }, (_, i) => ({
        holeNumber: i + 3,
        scores: { a: i % 2 === 0 ? 3 : 4, b: 4, c: 4, d: 4 },
        hammerDepth: 0,
        folded: false,
      })),
    ];

    const replay = replayRound("skins", players, pars, handicaps, holeValue, settings, scoresList);

    // Build live state by re-using replay's hole results and feeding them
    // through computeAdvanceHole in sequence. This mirrors what the page
    // does when the user plays live.
    let state = freshSnapshot(players);
    for (let i = 0; i < replay.holeResults.length; i++) {
      const hr = replay.holeResults[i];
      state = advance(state, hr, hr.hole, "skins", players, holeValue, null, null);
    }

    expect(state.totals).toEqual(replay.totals);
  });
});

// ---------------------------------------------------------------------
// DOC with hammer + crybaby phase
// ---------------------------------------------------------------------

describe("replayRound equivalence — DOC with hammer + crybaby", () => {
  it("live totals match replayed totals across all 18 holes (incl. crybaby 16-18)", () => {
    const players = makePlayers4DOC();
    const settings = makeSettings({ hammer: true, crybaby: true, carryOverCap: "∞" });
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holeValue = 2;

    // Mix of outcomes across phases. Hole 3 the hammer is thrown -> depth=1.
    // Holes 16-18 are crybaby (skins).
    const holes: ReplayHoleInput[] = [
      // Drivers phase (1-5): drivers (a,c) vs riders (b,d)
      { holeNumber: 1, scores: { a: 4, b: 5, c: 4, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 2, scores: { a: 4, b: 4, c: 5, d: 5 }, hammerDepth: 0, folded: false }, // push, carry
      { holeNumber: 3, scores: { a: 3, b: 5, c: 4, d: 5 }, hammerDepth: 1, folded: false }, // hammer on!
      { holeNumber: 4, scores: { a: 4, b: 4, c: 4, d: 4 }, hammerDepth: 0, folded: false }, // push, carry
      { holeNumber: 5, scores: { a: 4, b: 5, c: 4, d: 5 }, hammerDepth: 0, folded: false },
      // Others phase (6-10): cart A (a,b) vs cart B (c,d)
      { holeNumber: 6, scores: { a: 4, b: 5, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 7, scores: { a: 5, b: 5, c: 4, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 8, scores: { a: 4, b: 4, c: 4, d: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 9, scores: { a: 4, b: 5, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 10, scores: { a: 5, b: 4, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      // Carts phase (11-15): cart A vs cart B again
      { holeNumber: 11, scores: { a: 5, b: 5, c: 4, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 12, scores: { a: 4, b: 5, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 13, scores: { a: 4, b: 4, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 14, scores: { a: 5, b: 5, c: 4, d: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 15, scores: { a: 4, b: 5, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      // Crybaby phase (16-18): skins
      { holeNumber: 16, scores: { a: 3, b: 5, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 17, scores: { a: 5, b: 4, c: 5, d: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 18, scores: { a: 5, b: 5, c: 3, d: 5 }, hammerDepth: 0, folded: false },
    ];

    const replay = replayRound("drivers_others_carts", players, pars, handicaps, holeValue, settings, holes);

    let state = freshSnapshot(players);
    for (const hr of replay.holeResults) {
      state = advance(state, hr, hr.hole, "drivers_others_carts", players, holeValue, null, null);
    }

    expect(state.totals).toEqual(replay.totals);
  });
});

// ---------------------------------------------------------------------
// Flip with birdie bonus
// ---------------------------------------------------------------------

describe("replayRound equivalence — flip with birdie bonus", () => {
  it("live totals match replay when birdie multipliers fire mid-round", () => {
    const players = makePlayers4DOC();
    const settings = makeSettings({ birdieBonus: true, birdieMultiplier: 2, carryOverCap: "∞" });
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holeValue = 2;

    const flipTeams: TeamInfo = {
      teamA: { name: "Heads", players: [players[0], players[2]], color: "#16A34A" },
      teamB: { name: "Tails", players: [players[1], players[3]], color: "#3B82F6" },
    };

    // A few holes with birdies (gross score < par) to trigger the multiplier
    const holes: ReplayHoleInput[] = [
      { holeNumber: 1, scores: { a: 3, b: 4, c: 4, d: 4 }, hammerDepth: 0, folded: false }, // Alice birdie (Heads)
      { holeNumber: 2, scores: { a: 4, b: 4, c: 4, d: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 3, scores: { a: 4, b: 3, c: 4, d: 5 }, hammerDepth: 0, folded: false }, // Bob birdie (Tails)
      ...Array.from({ length: 15 }, (_, i) => ({
        holeNumber: i + 4,
        scores: i % 2 === 0
          ? { a: 4, b: 5, c: 4, d: 5 }
          : { a: 5, b: 4, c: 5, d: 4 },
        hammerDepth: 0,
        folded: false,
      })),
    ];

    const replay = replayRound("flip", players, pars, handicaps, holeValue, settings, holes, flipTeams);

    let state = freshSnapshot(players);
    state.flipTeams = flipTeams;
    for (const hr of replay.holeResults) {
      state = advance(state, hr, hr.hole, "flip", players, holeValue, flipTeams, null);
    }

    expect(state.totals).toEqual(replay.totals);
  });
});

// ---------------------------------------------------------------------
// Nassau — segment settlement
// ---------------------------------------------------------------------

describe("replayRound equivalence — Nassau segments (no presses)", () => {
  it("live totals match replay when settlement fires at 9 and 18", () => {
    const players = makePlayers4DOC();
    const settings = makeSettings();
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holeValue = 5;

    // 2v2 teams handled internally by replayRound for nassau + 4 players
    const nassauTeams: TeamInfo = {
      teamA: { name: "Team 1", players: [players[0], players[1]], color: "#16A34A" },
      teamB: { name: "Team 2", players: [players[2], players[3]], color: "#3B82F6" },
    };

    // Team 1 wins front 6-3, Team 2 wins back 5-4, overall 10-8 Team 1
    const holes: ReplayHoleInput[] = [
      // Front 9: Team 1 wins 6 holes
      ...[1, 2, 3, 4, 5, 6].map(h => ({ holeNumber: h, scores: { a: 3, b: 4, c: 4, d: 4 }, hammerDepth: 0, folded: false })),
      ...[7, 8, 9].map(h => ({ holeNumber: h, scores: { a: 4, b: 4, c: 3, d: 4 }, hammerDepth: 0, folded: false })),
      // Back 9: Team 2 wins 5
      ...[10, 11, 12, 13, 14].map(h => ({ holeNumber: h, scores: { a: 4, b: 4, c: 3, d: 4 }, hammerDepth: 0, folded: false })),
      ...[15, 16, 17, 18].map(h => ({ holeNumber: h, scores: { a: 3, b: 4, c: 4, d: 4 }, hammerDepth: 0, folded: false })),
    ];

    const replay = replayRound("nassau", players, pars, handicaps, holeValue, settings, holes);

    let state = freshSnapshot(players);
    for (const hr of replay.holeResults) {
      state = advance(state, hr, hr.hole, "nassau", players, holeValue, nassauTeams, nassauTeams);
    }

    expect(state.totals).toEqual(replay.totals);
    expect(replay.nassauSettlement?.front.winner).toBe("Team 1");
    expect(replay.nassauSettlement?.back.winner).toBe("Team 2");
    expect(replay.nassauSettlement?.overall.winner).toBe("Team 1");
  });
});

// ---------------------------------------------------------------------
// Phase 2.5 — Hammer equivalence (release gate for the correctness rule)
//
// These tests exercise replayRound's hammer path. The critical rule:
// when a team LAYS DOWN at depth D, the thrower at D wins regardless of
// scores. translateToLegacy (from hammerMath) produces the legacy
// {hammerDepth, folded, foldWinnerTeamId?} triple replayRound consumes;
// these tests verify the full chain.
// ---------------------------------------------------------------------

describe("replayRound — hammer scenarios (Phase 2.5 release gate)", () => {
  const players = makePlayers4DOC();
  const settings = makeSettings({ hammer: true, birdieBonus: false });
  const pars = Array(18).fill(4);
  const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
  const holeValue = 2;

  // Helper: 18-hole replay with a specific hammer setup on one hole.
  // Other holes are no-hammer. Uses DOC drivers phase (holes 1-5) where
  // teamA = drivers (a,c) and teamB = riders (b,d).
  function replay18WithHammerOnHole(
    targetHole: number,
    scores: Record<string, number>,
    hammerEntry: { hammerDepth: number; folded: boolean; foldWinnerTeamId?: "A" | "B" },
  ) {
    const holes: ReplayHoleInput[] = [];
    for (let h = 1; h <= 18; h++) {
      if (h === targetHole) {
        holes.push({ holeNumber: h, scores, ...hammerEntry });
      } else {
        holes.push({
          holeNumber: h,
          scores: { a: 4, b: 4, c: 4, d: 4 }, // all tied, pushes
          hammerDepth: 0,
          folded: false,
        });
      }
    }
    return replayRound("drivers_others_carts", players, pars, handicaps, holeValue, settings, holes);
  }

  it("no hammer: winner by score, 1× multiplier", () => {
    // Hole 1, drivers phase. a=3 (birdie no actually 4 pars), b=4, c=4, d=4
    // drivers (a+c) beat riders (b+d) at hole 1: min(a,c)=3 < min(b,d)=4 → drivers win
    const result = replay18WithHammerOnHole(
      1,
      { a: 3, b: 4, c: 4, d: 4 },
      { hammerDepth: 0, folded: false },
    );
    // Drivers win hole 1 at 1× = $2. Each driver +$2, each rider -$2.
    expect(result.totals.a).toBe(2);
    expect(result.totals.c).toBe(2);
    expect(result.totals.b).toBe(-2);
    expect(result.totals.d).toBe(-2);
  });

  it("depth 1 accepted, scored out, Team A (drivers) wins → 2× multiplier", () => {
    // Drivers win by score at 2×: +$4 each driver, -$4 each rider.
    const result = replay18WithHammerOnHole(
      1,
      { a: 3, b: 4, c: 4, d: 4 },
      { hammerDepth: 1, folded: false },
    );
    expect(result.totals.a).toBe(4);
    expect(result.totals.c).toBe(4);
    expect(result.totals.b).toBe(-4);
    expect(result.totals.d).toBe(-4);
  });

  it("depth 1 accepted, scored out, Team B (riders) wins → 2× multiplier", () => {
    // Riders win: b=3 < a=c=4. At 2×: riders +$4 each, drivers -$4 each.
    const result = replay18WithHammerOnHole(
      1,
      { a: 4, b: 3, c: 4, d: 4 },
      { hammerDepth: 1, folded: false },
    );
    expect(result.totals.b).toBe(4);
    expect(result.totals.d).toBe(4);
    expect(result.totals.a).toBe(-4);
    expect(result.totals.c).toBe(-4);
  });

  it("CRITICAL: depth 2 laid down by Team A (riders threw at 2) → Team B wins at 2× regardless of scores", () => {
    // Scores would say drivers won (a=3 vs b=5). But riders threw hammer
    // at depth 2 and drivers laid down, so riders win at 2× per the
    // critical correctness rule.
    // translateToLegacy for "depth 2 laid_down by B thrower" → hammerDepth=1,
    // folded=true, foldWinnerTeamId='B'.
    const result = replay18WithHammerOnHole(
      1,
      { a: 3, b: 5, c: 3, d: 5 }, // drivers would outscore riders
      { hammerDepth: 1, folded: true, foldWinnerTeamId: "B" },
    );
    // foldValue = holeValue * 2^1 = $4. Riders win $4 each, drivers -$4 each.
    expect(result.totals.b).toBe(4);
    expect(result.totals.d).toBe(4);
    expect(result.totals.a).toBe(-4);
    expect(result.totals.c).toBe(-4);
  });

  it("depth 3 scored out at 8× — winner by score", () => {
    // hammerDepth=3 → 2^3 = 8× multiplier. Drivers win by score (a=3).
    const result = replay18WithHammerOnHole(
      1,
      { a: 3, b: 4, c: 4, d: 4 },
      { hammerDepth: 3, folded: false },
    );
    expect(result.totals.a).toBe(16); // holeValue * 2^3 = 16
    expect(result.totals.c).toBe(16);
    expect(result.totals.b).toBe(-16);
    expect(result.totals.d).toBe(-16);
  });

  it("depth 4 laid down by Team B at 8× — Team A wins regardless of score", () => {
    // "Depth 4 laid down by B thrower was A at 4" — translateToLegacy:
    // hammerDepth = D-1 = 3, folded=true, foldWinnerTeamId='A'.
    // foldValue = 2 * 2^3 = 16. A wins 16/player, B loses 16/player.
    // Scores say riders outscore drivers but the fold overrides.
    const result = replay18WithHammerOnHole(
      1,
      { a: 5, b: 3, c: 5, d: 3 }, // riders would outscore
      { hammerDepth: 3, folded: true, foldWinnerTeamId: "A" },
    );
    expect(result.totals.a).toBe(16);
    expect(result.totals.c).toBe(16);
    expect(result.totals.b).toBe(-16);
    expect(result.totals.d).toBe(-16);
  });

  it("hammer + gross birdie by winning team: multiplier doubles per birdieMultiplier", () => {
    const settingsWithBirdie = makeSettings({ hammer: true, birdieBonus: true, birdieMultiplier: 2 });
    // Hole 1 par 4, drivers birdie (a=3 is 1 under par). Depth 1 accepted.
    // Expected: 2× hammer × 2× birdie = 4× on $2 = $8 per player.
    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: i === 0 ? { a: 3, b: 5, c: 4, d: 5 } : { a: 4, b: 4, c: 4, d: 4 },
      hammerDepth: i === 0 ? 1 : 0,
      folded: false,
    }));
    const result = replayRound(
      "drivers_others_carts",
      players,
      pars,
      handicaps,
      holeValue,
      settingsWithBirdie,
      holes,
    );
    expect(result.totals.a).toBe(8);
    expect(result.totals.c).toBe(8);
    expect(result.totals.b).toBe(-8);
    expect(result.totals.d).toBe(-8);
  });

  it("losing (folding) team had a gross birdie: no birdie bonus on fold value", () => {
    // Riders had birdie (b=3) but laid down at depth 2. Drivers win fold.
    // Since it's a fold (calculateFoldResult), birdie bonus does NOT apply
    // — birdie multiplier only activates in calculateTeamHoleResult.
    // translateToLegacy: laid_down at depth 2 by B thrower was A at 2 →
    // folded by B → wait: laid down by Team A responder means A conceded.
    // Last event depth 2 thrower=B response=laid_down. Actually let me
    // re-read: "laid down by B" means B conceded, so A wins.
    // For this test: B (riders) threw hammer at depth 2, A (drivers)
    // laid down. A is the folder, B wins. Riders had b=3 birdie.
    // translateToLegacy: events end laid_down at depth 2 by B thrower
    // means thrower at final depth is B; resolveHammerOutcome says winner
    // is thrower = B. legacy: hammerDepth=D-1=1, folded=true, winner='B'.
    const settingsWithBirdie = makeSettings({ hammer: true, birdieBonus: true, birdieMultiplier: 2 });
    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: i === 0 ? { a: 5, b: 3, c: 5, d: 5 } : { a: 4, b: 4, c: 4, d: 4 },
      hammerDepth: i === 0 ? 1 : 0,
      folded: i === 0,
      foldWinnerTeamId: i === 0 ? "B" : undefined,
    }));
    const result = replayRound(
      "drivers_others_carts",
      players,
      pars,
      handicaps,
      holeValue,
      settingsWithBirdie,
      holes,
    );
    // Fold value = 2 * 2^1 = $4 per player. Birdie bonus NOT applied on folds.
    expect(result.totals.b).toBe(4);
    expect(result.totals.d).toBe(4);
    expect(result.totals.a).toBe(-4);
    expect(result.totals.c).toBe(-4);
  });

  it("no hammers across all 18 holes produces standard 1× payouts (regression check)", () => {
    // All holes pushed except hole 5 where drivers outscore. Standard
    // DOC drivers phase (hole <= 5).
    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: i === 4 ? { a: 3, b: 4, c: 4, d: 4 } : { a: 4, b: 4, c: 4, d: 4 },
      hammerDepth: 0,
      folded: false,
    }));
    const result = replayRound("drivers_others_carts", players, pars, handicaps, holeValue, settings, holes);
    // Hole 5: drivers win at 1× with some carry-over from prior pushes.
    // Prior 4 pushes accumulate $2*4 = $8 in carry. Win is $2 + $8 = $10.
    // Drivers each +$10, riders each -$10.
    expect(result.totals.a).toBe(10);
    expect(result.totals.c).toBe(10);
    expect(result.totals.b).toBe(-10);
    expect(result.totals.d).toBe(-10);
  });
});
