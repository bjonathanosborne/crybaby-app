import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  calculateFlipHoleResult,
  initRollingCarryWindow,
  getStrokesOnHole,
  type Player,
  type TeamInfo,
} from "@/lib/gameEngines";

// ============================================================
// PR #55 — Jonathan's Flip best-ball regression test.
//
// First on-course Flip round (2026-04-29) surfaced a settlement-
// affecting bug: a hole that should have been won was scored as a
// push.
//
// Root cause: src/pages/CrybabyActiveRound.tsx::calculateHoleResult
// had no Flip-specific branch. Live Flip holes fell through to the
// DOC team-based math, which silently picked up DOC-only rules —
// notably PR #31's birdie-forced-push (a hole pushes if team A has
// a gross birdie crossed with team B having a net birdie via pop).
//
// On-course scenario:
//   - Player A on the 2-man team scored a gross birdie with a pop
//     → net = par - 2 (eagle equivalent).
//   - Player B on the 3-man team scored par with a pop
//     → net = par - 1 (net birdie via pop).
//   - DOC's birdie-forced-push fired (A had gross birdie, B had net
//     birdie) → engine pushed the hole.
//
// Per the canonical Flip spec the right behavior is:
//   - Best-ball: 2-man team's best net (par-2) < 3-man team's best
//     net (par-1) → 2-man team wins.
//   - 3v2 asymmetric stakes: 3-man team's three players each lose
//     $B; 2-man team's two players each win $1.5B. Total moved:
//     $3B (all from losers' pockets).
//
// This test pins both behaviors via a direct call to
// calculateFlipHoleResult — the same engine the live page now
// invokes after PR #55 commit 1.
//
// Test name surfaces the on-course origin so future engineers
// reading a stack trace know exactly what real failure mode it
// guards against.
// ============================================================

const players: Player[] = [
  // 2-man team — Jonathan + Michael (the team that should have won)
  { id: "p_jonathan", name: "Jonathan", handicap: 11, color: "#16A34A" },
  { id: "p_michael",  name: "Michael",  handicap: 6,  color: "#16A34A" },
  // 3-man team — Nick + Todd + 5th player
  { id: "p_nick",     name: "Nick",     handicap: 18, color: "#DC2626" },
  { id: "p_todd",     name: "Todd",     handicap: 8,  color: "#DC2626" },
  { id: "p_fifth",    name: "Fifth",    handicap: 14, color: "#DC2626" },
];

const teams: TeamInfo = {
  teamA: { name: "Heads (2-man)", color: "#16A34A", players: [players[0], players[1]] },
  teamB: { name: "Tails (3-man)", color: "#DC2626", players: [players[2], players[3], players[4]] },
};

describe("jonathan Flip best-ball — PR #55 on-course regression", () => {
  it("2-man team with gross birdie + pop wins outright (NOT a push)", () => {
    // Hole config: par 4, handicap rank 1 (the hardest hole — every
    // higher-handicap player gets at least 1 stroke).
    const par = 4;
    const holeRank = 1;
    const lowestHandicap = Math.min(...players.map(p => p.handicap)); // 6 (Michael)

    // Gross scores: Jonathan birdies (gross 3), Michael pars (gross 4),
    // Nick pars (gross 4), Todd pars (gross 4), Fifth bogeys (gross 5).
    const gross: Record<string, number> = {
      p_jonathan: 3, p_michael: 4, p_nick: 4, p_todd: 4, p_fifth: 5,
    };

    // Net score = gross - strokes-on-hole.
    const netScores: Record<string, number> = {};
    for (const p of players) {
      const strokes = getStrokesOnHole(p.handicap, lowestHandicap, holeRank);
      netScores[p.id] = gross[p.id] - strokes;
    }

    // Sanity check the net scores match the on-course story:
    //   Jonathan (hcp 11): 1 stroke on hole rank 1 → net = 3 - 1 = 2 (eagle equivalent)
    //   Michael (hcp 6):   0 strokes → net = 4 (par)
    //   Nick (hcp 18):     1 stroke → net = 3 (net birdie)
    //   Todd (hcp 8):      1 stroke → net = 3 (net birdie)
    //   Fifth (hcp 14):    1 stroke → net = 4 (net par)
    expect(netScores.p_jonathan).toBe(2);
    expect(netScores.p_michael).toBe(4);
    expect(netScores.p_nick).toBe(3);
    expect(netScores.p_todd).toBe(3);
    expect(netScores.p_fifth).toBe(4);

    const teamABest = Math.min(...teams.teamA.players.map(p => netScores[p.id])); // 2
    const teamBBest = Math.min(...teams.teamB.players.map(p => netScores[p.id])); // 3
    expect(teamABest).toBe(2);
    expect(teamBBest).toBe(3);

    // Engine call. With base-bet $4, decided-hole 3v2 asymmetric:
    //   3-man losers: each pays $4   → total $12 from losers
    //   2-man winners: each gains $6 → total $12 to winners
    const result = calculateFlipHoleResult({
      teams,
      teamABest,
      teamBBest,
      effectiveBet: 4,
      window: initRollingCarryWindow("all"),
      holeNumber: 1,
    });

    // The hole MUST NOT push.
    expect(result.push).toBe(false);
    expect(result.winningSide).toBe("A");
    expect(result.potFromBet).toBe(12); // 3 losers × $4 = $12

    // Asymmetric stakes — exactly what the user reported was missing
    // from the on-course display.
    const jonathanResult = result.perPlayer.find(p => p.id === "p_jonathan");
    const michaelResult  = result.perPlayer.find(p => p.id === "p_michael");
    const nickResult     = result.perPlayer.find(p => p.id === "p_nick");
    const toddResult     = result.perPlayer.find(p => p.id === "p_todd");
    const fifthResult    = result.perPlayer.find(p => p.id === "p_fifth");
    expect(jonathanResult?.amount).toBe(6);  // 2-man wins $1.5B = $6
    expect(michaelResult?.amount).toBe(6);
    expect(nickResult?.amount).toBe(-4);     // 3-man loses $B = $4
    expect(toddResult?.amount).toBe(-4);
    expect(fifthResult?.amount).toBe(-4);
    // Zero-sum sanity: totals across all 5 players = 0
    expect(result.perPlayer.reduce((s, p) => s + p.amount, 0)).toBe(0);
  });

  it("source-level guard: live calculateHoleResult routes Flip through calculateFlipHoleResult", () => {
    // The bug class — DOC math handling Flip — is forbidden going
    // forward. This pin asserts the live page imports + invokes the
    // canonical Flip engine.
    const repoRoot = path.resolve(__dirname, "..", "..");
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
      "utf8",
    );
    expect(src).toMatch(/calculateFlipHoleResult/);
    // The Flip branch must come before the DOC team-based math
    // (which is the inline "Calculate net scores using the imported
    // getStrokesOnHole" block).
    const flipIdx = src.indexOf("calculateFlipHoleResult({");
    const docIdx  = src.indexOf("Team-based games (DOC)");
    expect(flipIdx).toBeGreaterThan(0);
    expect(docIdx).toBeGreaterThan(flipIdx);
  });

  it("source-level guard: advanceHole transitions the rolling-window on Flip holes", () => {
    // Pre-PR-#55 the live advanceHole path never updated
    // rollingCarryWindow — Flip rounds played live silently dropped
    // their push-pot state. Pin the new wiring.
    const repoRoot = path.resolve(__dirname, "..", "..");
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
      "utf8",
    );
    expect(src).toMatch(/round\.gameMode === 'flip' && teams/);
    expect(src).toMatch(/appendPushToWindow\(baseWindow, currentHole, potThisHole\)/);
    expect(src).toMatch(/claimRollingCarryWindow\(baseWindow\)\.cleared/);
    expect(src).toMatch(/setRollingCarryWindow\(nextRollingCarryWindow\)/);
  });

  it("source-level guard: round resume restores rollingCarryWindow", () => {
    // Push-pot state should survive a resume mid-round. Pin the
    // hydration so a future refactor can't silently drop it again.
    const repoRoot = path.resolve(__dirname, "..", "..");
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
      "utf8",
    );
    expect(src).toMatch(/saved\.rollingCarryWindow/);
    expect(src).toMatch(/setRollingCarryWindow\(saved\.rollingCarryWindow as RollingCarryWindow\)/);
  });
});
