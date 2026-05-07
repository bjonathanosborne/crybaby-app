import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #56 — Scorecard mode completion-screen regression.
//
// Pre-PR-56, finishing a Scorecard-mode round (no money, no teams)
// dropped the user on the same money-themed completion screen as
// every other mode: trophy + +$0 column + Settlement section +
// Send Reminders button + a money quip ("walked away with +$0...
// is this round's crybaby... another dollar"). For a round where
// no money was on the line, every word of that was nonsense.
//
// Fix: branch the completion screen on hasMoneyMode.
//   - Money modes (DOC, Flip, Wolf, Skins, Nassau, Custom):
//     existing UI unchanged.
//   - Scorecard: stroke totals + vs-par per player; no Settlement;
//     no money quip; sort by lowest strokes (best) instead of by
//     highest balance.
//
// Source-level guards pin the new branch so a regression that
// flattens it back into the money UI fails CI.
// ============================================================

const repoRoot = path.resolve(__dirname, "..", "..");
const src = fs.readFileSync(
  path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
  "utf8",
);

describe("scorecard completion screen — PR #56", () => {
  it("computes per-player stroke totals from the scores state, defaulting unentered holes to par", () => {
    expect(src).toMatch(/totalStrokesByPlayer/);
    expect(src).toMatch(/totalParAccumulated/);
    // Default-to-par fallback for any hole the user didn't enter
    // (consistent with the par-default model from PR #43).
    expect(src).toMatch(/typeof v === "number" && Number\.isFinite\(v\)/);
  });

  it("sorts scorecard by lowest strokes (best) and money modes by highest balance", () => {
    // The ternary that switches sort criteria on hasMoneyMode.
    expect(src).toMatch(/hasMoneyMode\s*\?\s*\[\.\.\.players\]\.sort\(\(a, b\) => \(totals\[b\.id\] \|\| 0\) - \(totals\[a\.id\] \|\| 0\)\)/);
    expect(src).toMatch(/\[\.\.\.players\]\.sort\(\(a, b\) => \(totalStrokesByPlayer\[a\.id\] \|\| 0\) - \(totalStrokesByPlayer\[b\.id\] \|\| 0\)\)/);
  });

  it("Settlement section + Send Reminders button are gated on hasMoneyMode", () => {
    // The Settlement block opens with `{hasMoneyMode && (` and closes
    // with `)}` after the Send Reminders button. Pin both ends so a
    // future refactor can't drop the gate silently.
    expect(src).toMatch(/Settlement\s*—\s*money modes only/);
    expect(src).toMatch(/{hasMoneyMode && \(\s*\n\s*<div style=\{\{[\s\S]*?Settlement\s*<\/div>/);
  });

  it("scorecard mode renders a stroke total + vs-par instead of +$X", () => {
    // The non-money branch renders `{strokes}` with a "STROKES" label.
    expect(src).toMatch(/!hasMoneyMode && \(\s*\n\s*<div style=\{\{ fontSize: 11, color: "#8B7355"[\s\S]*?vs par/);
    expect(src).toMatch(/strokes\s*<\/div>/);
  });

  it("Round Recap quip branches: money quip OR scorecard quip, never both", () => {
    // Money branch keeps the canonical "walked away with +$X. is this round's crybaby" line.
    expect(src).toMatch(/walked away with \+\$\{totals\[winner\.id\]\}/);
    // Scorecard branch builds a stroke-themed quip with par-relative.
    expect(src).toMatch(/posted \{winnerStrokes\} \(\{parPhrase\}\) to take the card/);
    // Both are inside the same Round Recap block, gated by hasMoneyMode.
    expect(src).toMatch(/\{hasMoneyMode \? \(\s*\n\s*<>\s*\n\s*💬/);
  });

  it("Crybaby badge is suppressed in scorecard mode (lowest score = WINNER, not crybaby)", () => {
    // The `isCrybab` derivation must include `hasMoneyMode &&` —
    // otherwise the lowest-stroke player gets a CRYBABY label
    // even though they actually won.
    expect(src).toMatch(/const isCrybab = hasMoneyMode && i === sorted\.length - 1 && amount < 0/);
  });

  it("Scorecard header subtitle shows par + player count instead of empty space", () => {
    // Adds context to the dark-bar header.
    expect(src).toMatch(/Par \{totalParAccumulated\}/);
    expect(src).toMatch(/players\.length\} player\{players\.length !== 1 \? "s" : ""\}/);
  });
});
