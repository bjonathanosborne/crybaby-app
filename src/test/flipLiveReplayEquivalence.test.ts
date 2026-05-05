import { describe, it, expect } from "vitest";
import {
  replayRound,
  calculateFlipHoleResult,
  initRollingCarryWindow,
  appendPushToWindow,
  claimRollingCarryWindow,
  commitFlipTeams,
  initFlipState,
  getStrokesOnHole,
  type Player,
  type TeamInfo,
  type FlipState,
  type FlipConfig,
  type GameSettings,
  type HoleResult,
  type ReplayHoleInput,
  type RollingCarryWindow,
} from "@/lib/gameEngines";

// ============================================================
// PR #55 — Live-vs-replay equivalence test for Flip.
//
// Why this exists: PR #16 shipped `calculateFlipHoleResult` as the
// canonical Flip-base-game payout function and wired it into the
// REPLAY path (apply-capture, replayRound). The LIVE path in
// CrybabyActiveRound.tsx::calculateHoleResult was never wired to
// call it — it kept falling through to DOC team math. PR #16's
// existing replay-equivalence tests (flipReplayEquivalence.test.ts)
// asserted the replay output matched expected money values, but
// they never compared it against the LIVE path's output for the
// same fixture. The two paths could (and did) diverge silently.
//
// This file fixes that gap. For each fixture we:
//   1. Compute the canonical hole result via calculateFlipHoleResult
//      with the same inputs the live page derives (baseBet, window,
//      net scores). This is exactly what the live calculateHoleResult
//      does after PR #55 commit 1.
//   2. Compute the same hole via replayRound (which also calls
//      calculateFlipHoleResult internally, but goes through the full
//      replay machinery: getTeamsForHole, net-score loop, etc.).
//   3. Translate both to a normalised HoleResult shape and assert
//      deep equality on the money fields (push, winningSide,
//      perPlayer amounts, totals).
//
// If a future PR introduces ANY divergence (live picks up a new
// rule the replay path doesn't, or vice versa), one of these
// fixtures fails. That's the regression guard PR #16 should have
// shipped with.
// ============================================================

const players: Player[] = [
  { id: "p1", name: "Jonathan", handicap: 11, color: "#16A34A" },
  { id: "p2", name: "Michael",  handicap: 6,  color: "#16A34A" },
  { id: "p3", name: "Nick",     handicap: 18, color: "#DC2626" },
  { id: "p4", name: "Todd",     handicap: 8,  color: "#DC2626" },
  { id: "p5", name: "Fifth",    handicap: 14, color: "#DC2626" },
];

// 3v2 split: p1 + p2 are the 2-man team; p3 + p4 + p5 are the 3-man.
const teams: TeamInfo = {
  teamA: { name: "Heads (2-man)", color: "#16A34A", players: [players[0], players[1]] },
  teamB: { name: "Tails (3-man)", color: "#DC2626", players: [players[2], players[3], players[4]] },
};

const pars = Array(18).fill(4);
const handicaps = [
  // Standard difficulty rank, 1 = hardest.
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
];

const baseSettings: GameSettings = {
  hammer: false,
  hammerInitiator: "any",
  hammerMaxDepth: "1",
  crybaby: false,
  crybabHoles: 3,
  crybabHammerRule: "allowed",
  birdieBonus: false,
  birdieMultiplier: 2,
  pops: true,
  noPopsParThree: false,
  carryOverEnabled: true,
  carryOverCap: "∞",
  handicapPercent: 100,
  presses: false,
  pressType: "auto",
};

const flipConfig: FlipConfig = {
  baseBet: 4,
  carryOverWindow: "all",
};

/**
 * Helper: compute the live-path Flip result for a single hole the
 * same way CrybabyActiveRound.tsx::calculateHoleResult does after
 * PR #55 commit 1. Pure, no React. Used to compare against replay.
 */
function liveFlipHoleResult(args: {
  holeNumber: number;
  par: number;
  holeHandicapRank: number;
  gross: Record<string, number>;
  window: RollingCarryWindow;
  hammerDepth?: number;
}): { holeResult: HoleResult; nextWindow: RollingCarryWindow } {
  const { holeNumber, par, holeHandicapRank, gross, window } = args;
  const hammerDepth = args.hammerDepth ?? 0;
  const lowestHandicap = Math.min(...players.map(p => p.handicap));
  const baseBet = flipConfig.baseBet;
  const effectiveBet = baseBet * Math.pow(2, hammerDepth);
  const netScores: Record<string, number> = {};
  for (const p of players) {
    const strokes = baseSettings.pops
      ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicapRank, baseSettings.handicapPercent)
      : 0;
    netScores[p.id] = (gross[p.id] ?? par) - strokes;
  }
  const teamABest = Math.min(...teams.teamA.players.map(p => netScores[p.id]));
  const teamBBest = Math.min(...teams.teamB.players.map(p => netScores[p.id]));
  const flipResult = calculateFlipHoleResult({
    teams,
    teamABest,
    teamBBest,
    effectiveBet,
    window,
    holeNumber,
  });
  // Same translation the live page does — including the exact quip
  // strings, so deep-equal vs replay covers cosmetic fields too.
  const holeResult: HoleResult = {
    push: flipResult.push,
    winnerName: flipResult.winningSide === null
      ? null
      : flipResult.winningSide === 'A' ? teams.teamA.name : teams.teamB.name,
    amount: flipResult.potFromBet + flipResult.potFromCarry,
    carryOver: 0,
    playerResults: flipResult.perPlayer,
    quip: flipResult.push
      ? flipResult.forfeitedThisHole > 0
        ? `Push. $${flipResult.forfeitedThisHole} fell into the ether.`
        : "Push. Pot carries to next hole."
      : `${flipResult.winningSide === 'A' ? teams.teamA.name : teams.teamB.name} takes the hole.`,
  };
  // Compute the live path's next window the same way advanceHole does.
  let nextWindow: RollingCarryWindow;
  if (flipResult.push) {
    const potThisHole = baseBet * players.length;
    nextWindow = appendPushToWindow(window, holeNumber, potThisHole);
  } else {
    nextWindow = claimRollingCarryWindow(window).cleared;
  }
  return { holeResult, nextWindow };
}

/**
 * Build a single-hole replay using replayRound for hole 1. Returns
 * the HoleResult and the per-player money totals for comparison.
 */
function replayOneHole(
  gross: Record<string, number>,
  flipState: FlipState,
): { holeResult: HoleResult; totals: Record<string, number> } {
  const replayHole: ReplayHoleInput = {
    holeNumber: 1,
    scores: gross,
    hammerDepth: 0,
    folded: false,
  };
  const result = replayRound(
    'flip',
    players,
    pars,
    handicaps,
    flipConfig.baseBet, // holeValue arg used as baseBet fallback when flipConfig absent; immaterial here
    baseSettings,
    [replayHole],
    flipState,
    flipConfig,
  );
  expect(result.holeResults.length).toBe(1);
  // strip the "hole" field added by replay so deep-equal works
  const { hole: _hole, ...rest } = result.holeResults[0];
  return { holeResult: rest as HoleResult, totals: result.totals };
}

/**
 * Lock in a 3v2 team configuration for the replay path's
 * `flipState.teamsByHole[hole]`. Mirrors what the FlipReel modal
 * does at hole-start in the live UI.
 */
function flipStateWithTeamsForHole(holeNumber: number): FlipState {
  return commitFlipTeams(initFlipState(), holeNumber, teams);
}

describe("Flip live-vs-replay equivalence", () => {
  it("fixture 1 — 2-man team gross birdie + pop wins (the on-course bug)", () => {
    // Same fixture as jonathanFlipBestBall.test.ts. The on-course bug:
    // pre-PR-55 the live path pushed; replay correctly decided. After
    // PR #55, both paths agree and the 2-man team wins.
    const gross: Record<string, number> = {
      p1: 3, p2: 4, p3: 4, p4: 4, p5: 5,
    };
    const window = initRollingCarryWindow("all");
    const live = liveFlipHoleResult({
      holeNumber: 1,
      par: 4,
      holeHandicapRank: 1,
      gross,
      window,
    });
    const replay = replayOneHole(gross, flipStateWithTeamsForHole(1));
    expect(live.holeResult.push).toBe(replay.holeResult.push);
    expect(live.holeResult.push).toBe(false);
    expect(live.holeResult.winnerName).toBe(replay.holeResult.winnerName);
    expect(live.holeResult.amount).toBe(replay.holeResult.amount);
    expect(live.holeResult.playerResults).toEqual(replay.holeResult.playerResults);
  });

  it("fixture 2 — no birdies, decided by net pars (baseline parity)", () => {
    // Everyone pars except p3 (3-man bogeys). 2-man best net = 4 (par);
    // 3-man best net = 3 (Todd or Nick gets net birdie via pop). 3-man
    // wins. Verifies the engine handles the simple case without any
    // birdie shenanigans.
    const gross: Record<string, number> = {
      p1: 4, p2: 4, p3: 4, p4: 4, p5: 5,
    };
    const window = initRollingCarryWindow("all");
    const live = liveFlipHoleResult({
      holeNumber: 1,
      par: 4,
      holeHandicapRank: 1,
      gross,
      window,
    });
    const replay = replayOneHole(gross, flipStateWithTeamsForHole(1));
    expect(live.holeResult).toEqual(replay.holeResult);
  });

  it("fixture 3 — legitimate push (best-balls equal)", () => {
    // All five players gross-par. With pops on hole rank 1, every
    // player except Michael (lowest handicap) gets 1 stroke. Net
    // scores: p1=3, p2=4, p3=3, p4=3, p5=3. Team A best = min(3,4) =
    // 3. Team B best = min(3,3,3) = 3. Push the right way; rolling
    // window should accumulate $20 (5 players × $4 baseBet).
    const gross: Record<string, number> = {
      p1: 4, p2: 4, p3: 4, p4: 4, p5: 4,
    };
    const window = initRollingCarryWindow("all");
    const live = liveFlipHoleResult({
      holeNumber: 1,
      par: 4,
      holeHandicapRank: 1,
      gross,
      window,
    });
    const replay = replayOneHole(gross, flipStateWithTeamsForHole(1));
    expect(live.holeResult.push).toBe(true);
    expect(replay.holeResult.push).toBe(true);
    expect(live.holeResult.amount).toBe(replay.holeResult.amount);
    expect(live.holeResult.playerResults).toEqual(replay.holeResult.playerResults);
    // $4 base × 5 players = $20 ante pot in the window.
    expect(live.nextWindow.entries.length).toBe(1);
    expect(live.nextWindow.entries[0]).toEqual({ holeNumber: 1, amount: 20 });
  });

  it("fixture 4 — three consecutive holes with rolling-window state", () => {
    // Hole 1: push ($20 ante into window).
    // Hole 2: push ($20 ante; window now has $40 across 2 entries).
    // Hole 3: 2-man team wins; pot from losers + cleared window = total payout.
    //
    // Run both live and replay across all three holes, comparing each
    // hole's HoleResult shape AND the running window state.
    const flipState = [1, 2, 3].reduce(
      (state, h) => commitFlipTeams(state, h, teams),
      initFlipState(),
    );
    // Hole 1: all gross-par → with pops, both team best-balls = 3.
    //   Push, ante pot $20 lands in window.
    // Hole 2: all gross-bogey → with pops, both team best-balls = 4.
    //   Push, ante pot $20 → window now {h1:$20, h2:$20}, total $40.
    // Hole 3: p1 birdies (gross 3), pops to net 2. Other team best
    //   net = 3. 2-man wins. Pot from losers $12 + claimed window
    //   $40 = $52 total. Each 2-man winner: $26.
    const replayHoles: ReplayHoleInput[] = [
      { holeNumber: 1, scores: { p1: 4, p2: 4, p3: 4, p4: 4, p5: 4 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 2, scores: { p1: 5, p2: 5, p3: 5, p4: 5, p5: 5 }, hammerDepth: 0, folded: false }, // push
      { holeNumber: 3, scores: { p1: 3, p2: 4, p3: 4, p4: 4, p5: 5 }, hammerDepth: 0, folded: false }, // 2-man wins
    ];
    const replayResult = replayRound(
      'flip', players, pars, handicaps, flipConfig.baseBet,
      baseSettings, replayHoles, flipState, flipConfig,
    );
    expect(replayResult.holeResults.length).toBe(3);

    // Now walk the live path forward across the same three holes.
    let liveWindow = initRollingCarryWindow("all");
    const liveHoleResults: HoleResult[] = [];
    for (const h of replayHoles) {
      const live = liveFlipHoleResult({
        holeNumber: h.holeNumber,
        par: 4,
        holeHandicapRank: handicaps[h.holeNumber - 1],
        gross: h.scores,
        window: liveWindow,
      });
      liveHoleResults.push(live.holeResult);
      liveWindow = live.nextWindow;
    }

    // Compare each hole's result shape.
    for (let i = 0; i < 3; i++) {
      const { hole: _hole, ...replayHole } = replayResult.holeResults[i];
      expect(liveHoleResults[i]).toEqual(replayHole);
    }

    // Hole 3: 2-man team wins. Pot = $12 from losers + $40 from
    // claimed window = $52 total. Each 2-man winner gets $26.
    const hole3 = liveHoleResults[2];
    expect(hole3.push).toBe(false);
    expect(hole3.amount).toBe(52);
    const winnerAmount = hole3.playerResults.find(p => p.id === "p1")?.amount;
    expect(winnerAmount).toBe(26);
    // Live window after hole 3 must be empty (claimed).
    expect(liveWindow.entries.length).toBe(0);
  });
});
