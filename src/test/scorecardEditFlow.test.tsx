import { describe, it, expect, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #21 — RoundEditScores correctness fix for Scorecard rounds.
//
// Drive-by finding #1 from the PR #20 recon: the editor computed
// `canRecalcMoney = !isWolf && !isSolo`, which let Scorecard rounds
// fall into the money-recalc path. Side effects on any post-round
// Scorecard edit:
//   - round_players.total_score overwritten to 0 (stats break)
//   - empty-amount settlement rows written (isMoneyRound breaks)
//
// Fix: extend the guard to !isScorecard. Behaviour now matches Wolf
// + Solo: stroke-only updates, no settlement side effects.
//
// These are source-level tests — rendering the full RoundEditScores
// component in jsdom hits the Supabase auth-js loop that takes down
// every heavy integration test in this suite. Source checks exercise
// the same invariants (variable derivation + gate presence + banner
// render) without the noise.
// ============================================================

beforeEach(() => cleanup());

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

describe("RoundEditScores — Scorecard recognition (source-level)", () => {
  const src = readFile("src/pages/RoundEditScores.jsx");

  it("derives an isScorecard flag from gameMode", () => {
    expect(src).toMatch(/const isScorecard = gameMode === "scorecard"/);
  });

  it("canRecalcMoney excludes Scorecard (alongside Wolf + Solo)", () => {
    // Regex allows any whitespace — the literal is
    //   const canRecalcMoney = !isWolf && !isSolo && !isScorecard;
    expect(src).toMatch(
      /const canRecalcMoney\s*=\s*!isWolf\s*&&\s*!isSolo\s*&&\s*!isScorecard/,
    );
  });

  it("retains the existing Wolf + Solo short-circuit predicates", () => {
    // Regression guard — an inattentive refactor that removed !isWolf or
    // !isSolo would break Wolf / Solo edit flows. Lock all three in.
    expect(src).toMatch(/const isWolf = gameMode === "wolf"/);
    expect(src).toMatch(/const isSolo = gameMode === "solo"/);
    expect(src).toMatch(/const isScorecard = gameMode === "scorecard"/);
  });

  it("renders a Scorecard-specific banner explaining the stroke-only edit", () => {
    expect(src).toMatch(/data-testid="edit-scores-scorecard-banner"/);
    expect(src).toMatch(/Scorecard round/);
    expect(src).toMatch(/stroke scores only/);
    expect(src).toMatch(/No money to settle/);
  });

  it("banner is gated on isScorecard", () => {
    // The {isScorecard && (…)} wrapper must be present immediately
    // preceding the testid div.
    expect(src).toMatch(/\{isScorecard && \([\s\S]*?data-testid="edit-scores-scorecard-banner"/);
  });
});

describe("RoundEditScores — save flow consequences for Scorecard (source-level)", () => {
  const src = readFile("src/pages/RoundEditScores.jsx");

  it("total_score write path preserves stroke sum when !canRecalcMoney", () => {
    // The existing handler already branches on canRecalcMoney — this test
    // is a regression guard documenting that Scorecard rounds flow into
    // the strokeSum branch (now that canRecalcMoney is false for them).
    expect(src).toMatch(
      /totalScore:\s*canRecalcMoney\s*\?\s*\(newTotals\[p\.id\]\s*\|\|\s*0\)\s*:\s*Object\.values\(holeScores\)\.reduce/,
    );
  });

  it("updateRoundScoresAndSettlements (settlement write) is gated on canRecalcMoney", () => {
    // The existing if (canRecalcMoney) { updateRoundScoresAndSettlements(...) }
    // block must remain — Scorecard rounds now skip it since
    // canRecalcMoney = false.
    expect(src).toMatch(
      /if \(canRecalcMoney\) \{\s*await updateRoundScoresAndSettlements/,
    );
  });

  it("non-money modes fall through to updatePlayerScores (per-player stroke write)", () => {
    // The else branch of `if (canRecalcMoney)` calls updatePlayerScores
    // per player — this is the path Wolf + Solo + now Scorecard take.
    expect(src).toMatch(
      /\} else \{[\s\S]*?await updatePlayerScores\(pu\.playerId, pu\.holeScores, pu\.totalScore\)/,
    );
  });
});
