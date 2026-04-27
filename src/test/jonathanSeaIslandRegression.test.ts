import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #28 — Jonathan's Sea Island regression test.
//
// On 2026-04-27 Jonathan reported on-course at Sea Island:
//   "OCR misread strokes AND the resulting captured scores were
//    harder to edit than manually-entered ones."
//
// Recon (see PR #28 description) confirmed there is NO state
// distinction between captured and manual scores in this codebase:
//   - round_players.hole_scores is a plain Record<string, number>.
//   - apply-capture's write shape is identical to manual entry.
//   - RoundEditScores edits scores via +/- buttons without checking
//     origin.
//
// So the perceived UX issue was workflow friction (round flips to
// `completed` after capture → corrections route through the grid
// UI rather than mid-round inline +/- buttons), not a code bug.
//
// This file is the explicit regression guard the user requested:
// "Specifically test the bug Jonathan hit today: a score that
// would have been OCR-captured can be freely edited via +/-
// buttons without any state-based block."
//
// Source-level / shape-level proofs (the codebase pattern — see
// scorecardEditFlow.test.tsx for the rationale on avoiding
// supabase-auth-loop-prone mounts):
//
//   1. The +/- buttons in RoundEditScores call handleScoreEdit
//      with a plain numeric delta — no source/origin/captureId
//      argument.
//   2. Score values are read directly off `editedScores[hole][playerId]`
//      as plain numbers — no `.value` / `.source` / `.captured`
//      property access on score reads.
//   3. The load path (RoundEditScores useEffect) treats
//      p.hole_scores as a plain { hole: score } map and stores
//      score values directly — no unwrapping of metadata.
//   4. apply-capture's write merge keeps the same shape as the
//      manual write — `Record<string, Record<number, number>>`,
//      not a wrapped union.
//   5. db.ts's manual write `updatePlayerScores(playerId, holeScores)`
//      takes the same shape with no source argument.
//
// Failing any of these would mean someone re-introduced a captured-
// vs-manual distinction. Read the failure as: "the unification
// property is broken; on-course UX bug Jonathan hit will resurface."
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

const ROUND_EDIT_SCORES = readFile("src/pages/RoundEditScores.jsx");
const APPLY_CAPTURE = readFile("supabase/functions/apply-capture/index.ts");
const DB = readFile("src/lib/db.ts");

// ------------------------------------------------------------
// Block 1 — +/- buttons take a plain numeric value, no source.
// ------------------------------------------------------------

describe("Jonathan's regression — +/- buttons edit any score regardless of origin", () => {
  it("the minus button calls handleScoreEdit(hole, playerId, value-1)", () => {
    // The literal in RoundEditScores is:
    //   <button onClick={() => handleScoreEdit(hole, p.id, (score || par) - 1)}>−</button>
    expect(ROUND_EDIT_SCORES).toMatch(
      /onClick=\{[^}]*handleScoreEdit\(hole,\s*p\.id,\s*\(score \|\| par\)\s*-\s*1\)/,
    );
  });

  it("the plus button calls handleScoreEdit(hole, playerId, value+1)", () => {
    expect(ROUND_EDIT_SCORES).toMatch(
      /onClick=\{[^}]*handleScoreEdit\(hole,\s*p\.id,\s*\(score \|\| par\)\s*\+\s*1\)/,
    );
  });

  it("handleScoreEdit signature is (hole, playerId, newScore) — no source/origin/captureId argument", () => {
    // The handler should take exactly three positional args. A signature
    // like (hole, playerId, newScore, source) would break this.
    expect(ROUND_EDIT_SCORES).toMatch(
      /function\s+handleScoreEdit\s*\(\s*hole\s*,\s*playerId\s*,\s*newScore\s*\)/,
    );
    // Defensive: no fourth arg with capture-related names.
    expect(ROUND_EDIT_SCORES).not.toMatch(/handleScoreEdit\s*\(\s*hole\s*,\s*playerId\s*,\s*newScore\s*,\s*(source|origin|captureId|captured)/);
  });

  it("+/- buttons have no disabled prop keyed on score origin", () => {
    // The buttons render without a disabled={…} prop. If a future
    // refactor adds disabled={score.captured} or similar, this fails.
    // Pattern: search the JSX for handleScoreEdit followed within a
    // small window by `disabled=` — there should be no such pairing.
    const stepBtnPlusOnly = ROUND_EDIT_SCORES.match(
      /handleScoreEdit\(hole,\s*p\.id,[\s\S]{0,200}\}/g,
    ) || [];
    for (const match of stepBtnPlusOnly) {
      expect(match).not.toMatch(/disabled=/);
    }
  });
});

// ------------------------------------------------------------
// Block 2 — Score reads pull plain numbers, no metadata unwrap.
// ------------------------------------------------------------

describe("Jonathan's regression — score reads have no metadata access", () => {
  it("score is read directly from editedScores[String(hole)]?.[p.id]", () => {
    expect(ROUND_EDIT_SCORES).toMatch(
      /const\s+score\s*=\s*editedScores\[String\(hole\)\]\?\.\[p\.id\]/,
    );
  });

  it("score reads do NOT unwrap a .value property (no { value, source } wrapper)", () => {
    // Strip comments first so historical references don't false-match.
    const stripped = ROUND_EDIT_SCORES
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Pattern: editedScores[hole][p.id].value or .source / .captured.
    expect(stripped).not.toMatch(/editedScores\[[^\]]+\]\??\.\[?[^\]]+\]?\.value\b/);
    expect(stripped).not.toMatch(/editedScores\[[^\]]+\]\??\.\[?[^\]]+\]?\.source\b/);
    expect(stripped).not.toMatch(/editedScores\[[^\]]+\]\??\.\[?[^\]]+\]?\.captured\b/);
  });

  it("hole_scores load path stores score values as plain numbers", () => {
    // The load is:
    //   Object.entries(p.hole_scores).forEach(([hole, score]) => {
    //     scores[hole][p.id] = score;
    //   });
    // No `.value` access, no `if (score.source === 'capture')` branch.
    expect(ROUND_EDIT_SCORES).toMatch(
      /Object\.entries\(p\.hole_scores\)\.forEach\(\(\[hole,\s*score\]\)\s*=>/,
    );
    expect(ROUND_EDIT_SCORES).toMatch(/scores\[hole\]\[p\.id\]\s*=\s*score\b/);
  });
});

// ------------------------------------------------------------
// Block 3 — Write paths are shape-identical between apply-capture
// and manual entry. A captured score and a manual score are
// indistinguishable post-write.
// ------------------------------------------------------------

describe("Jonathan's regression — write paths produce identical shapes", () => {
  it("apply-capture types nextScoresByPlayer as Record<string, Record<number, number>>", () => {
    expect(APPLY_CAPTURE).toMatch(
      /nextScoresByPlayer:\s*Record<string,\s*Record<number,\s*number>>/,
    );
  });

  it("apply-capture writes hole_scores as a plain map (no wrapper, no source field)", () => {
    expect(APPLY_CAPTURE).toMatch(/hole_scores:\s*nextScoresByPlayer\[rp\.id\]/);
    expect(APPLY_CAPTURE).not.toMatch(/source:\s*["'](?:capture|ocr)["']/);
    expect(APPLY_CAPTURE).not.toMatch(/captured:\s*true/);
    expect(APPLY_CAPTURE).not.toMatch(/origin:\s*["'](?:capture|ocr|server)["']/);
  });

  it("db.ts updatePlayerScores writes plain hole_scores too", () => {
    // The manual write is `.update({ hole_scores, total_score })` on
    // round_players. No source field, no captured flag, no metadata.
    expect(DB).toMatch(/updatePlayerScores/);
    expect(DB).toMatch(/hole_scores/);
    // No wrapped object writes
    expect(DB).not.toMatch(/source:\s*["'](?:manual|capture|ocr)["']/);
    expect(DB).not.toMatch(/score_source\b/);
    expect(DB).not.toMatch(/captured_flag\b/);
  });

  it("apply-capture and manual entry write to the SAME column (hole_scores), not separate tables", () => {
    // Both writers should target round_players.hole_scores. No
    // captured_scores table, no scores_meta sidetable.
    expect(APPLY_CAPTURE).toMatch(/from\(["']round_players["']\)/);
    expect(DB).toMatch(/from\(["']round_players["']\)/);
    expect(APPLY_CAPTURE).not.toMatch(/from\(["'](?:captured_scores|scores_meta|score_sources)["']\)/);
    expect(DB).not.toMatch(/from\(["'](?:captured_scores|scores_meta|score_sources)["']\)/);
  });
});

// ------------------------------------------------------------
// Block 4 — Symmetry guarantee.
// If apply-capture writes { player1: { hole5: 4 } } and a user
// later edits hole 5 manually to 5, the resulting row should be
// indistinguishable from a row where hole 5 was always manually
// entered as 5. This block locks in the shape symmetry that makes
// that property hold by construction.
// ------------------------------------------------------------

describe("Jonathan's regression — symmetry: captured == manual after edit", () => {
  it("the merge in apply-capture uses spread (not a wrapper-aware merge)", () => {
    // The merge is:
    //   nextScoresByPlayer[rp.id] = { ...priorScores[rp.id], ...confirmedForPlayer };
    // Plain object spread guarantees no metadata sneaks in.
    expect(APPLY_CAPTURE).toMatch(
      /nextScoresByPlayer\[rp\.id\]\s*=\s*\{\s*\.\.\.priorScores\[rp\.id\],\s*\.\.\.confirmedForPlayer\s*\}/,
    );
  });

  it("RoundEditScores save path overwrites hole_scores with the edited plain map", () => {
    // The save reads editedScores[String(h)][p.id] and writes the
    // merged map back. No special-casing for previously-captured
    // entries.
    expect(ROUND_EDIT_SCORES).toMatch(
      /holeScores\[String\(h\)\]\s*=\s*editedScores\[String\(h\)\]\[p\.id\]/,
    );
  });

  it("no test or runtime code branches on a 'last write source' marker", () => {
    // If a wrapper {value, source, lastWriter} was ever introduced,
    // this assertion would catch it.
    const allFiles = [ROUND_EDIT_SCORES, APPLY_CAPTURE, DB];
    for (const src of allFiles) {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(stripped).not.toMatch(/lastWriter\s*===\s*["'](?:capture|ocr|manual)["']/);
      expect(stripped).not.toMatch(/score\.lastWriter/);
    }
  });
});
