import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getStrokesOnHole } from "@/lib/gameEngines";

// ============================================================
// PR #32 — Jonathan's DOC pop math regression test.
//
// On 2026-04-29 Jonathan reported on-course (DOC round at Sea Island):
//   "DOC round computed pops incorrectly. The lowest-handicap player
//    got strokes they shouldn't have."
//
// Forensics on round 1b3bd20e-2e82-45d1-a880-84f72ca8d797 (the
// only DOC round in his history at the time of the report) showed:
//
//   Player           rawHandicap  stored (pre-fix Math.floor)
//   Jonathan Osborne     13.6        13
//   Michael Said          8.0         8
//   Todd Bailey           7.8         7   ← lost 0.8 to floor
//   Nicholas Moncure     17.9        17   ← lost 0.9 to floor
//
// With Math.floor: Todd at 7 is "lowest"; Michael at 8 has diff=1,
// gets 1 pop on the hardest hole. But raw values are 7.8 vs 8.0 —
// essentially tied. Michael got a stroke he shouldn't have.
//
// PR #32 fix: db.ts switches the round-start scaling from
// Math.floor to Math.round (matches the engine's existing
// Math.round in getStrokesOnHole). With round-to-nearest:
//   13.6 → 14, 8.0 → 8, 7.8 → 8, 17.9 → 18.
// Lowest is now 8 (Michael & Todd tied). Diffs: 6, 0, 0, 10.
// Pops: Jonathan 6, Michael 0, Todd 0, Nicholas 10.
//
// Two failure modes this file guards against:
//   1. The Math.floor regression (anyone "fixing" the rounding by
//      reverting to truncation).
//   2. Engine ↔ round-start rounding disagreement (e.g. someone
//      changes one rule but not the other; both must use round).
//
// File name surfaces the on-course origin so future engineers
// reading a stack trace know exactly what real failure mode it
// guards against. Matches the pattern from PR #28's
// jonathanSeaIslandRegression and PR #31's
// jonathanHammerConcessionBirdie.
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

const DB = readFile("src/lib/db.ts");

// ------------------------------------------------------------
// Block 1 — Round-start rounding: 5 baseline cases at percent=100.
// ------------------------------------------------------------

describe("Round-start handicap rounding — Math.round, not Math.floor (PR #32)", () => {
  // The actual rounding happens inside db.ts's startRound +
  // createRound playerConfig builders. These are the canonical
  // round-trip cases the user explicitly listed.

  const round = (raw: number, percent = 100): number =>
    Math.round((raw * percent) / 100);

  it("7.8 raw → 8 stored (the on-course Todd Bailey case)", () => {
    expect(round(7.8)).toBe(8);
  });

  it("17.9 raw → 18 stored (the on-course Nicholas Moncure case)", () => {
    expect(round(17.9)).toBe(18);
  });

  it("7.4 raw → 7 stored (rounds DOWN below the .5 boundary)", () => {
    expect(round(7.4)).toBe(7);
  });

  it("13.6 raw → 14 stored (the on-course Jonathan case)", () => {
    expect(round(13.6)).toBe(14);
  });

  it("8.0 raw → 8 stored (integer input is identity)", () => {
    expect(round(8.0)).toBe(8);
  });
});

// ------------------------------------------------------------
// Block 2 — Percentage scaling at percent=80 (slider moved).
// ------------------------------------------------------------

describe("Round-start handicap scaling — percent != 100 + Math.round", () => {
  const round = (raw: number, percent: number): number =>
    Math.round((raw * percent) / 100);

  it("at percent=80, raw 13.6 → 11 (13.6 × 0.8 = 10.88, rounds to 11)", () => {
    // The user's spec called this out explicitly: not 10 (floor),
    // not 11 (round). Standard rounding.
    expect(round(13.6, 80)).toBe(11);
    // Sanity: pre-fix Math.floor would have produced 10 (lossy).
    expect(Math.floor((13.6 * 80) / 100)).toBe(10);
  });

  it("at percent=80, raw 7.8 → 6 (7.8 × 0.8 = 6.24, rounds to 6)", () => {
    expect(round(7.8, 80)).toBe(6);
    expect(Math.floor((7.8 * 80) / 100)).toBe(6); // happens to match here
  });
});

// ------------------------------------------------------------
// Block 3 — Tied-lowest handling: tied players both get 0 pops.
// Driven by getStrokesOnHole, which already returns 0 when the
// diff is <= 0.
// ------------------------------------------------------------

describe("Tied-lowest handicap handling — both get 0 pops (PR #32)", () => {
  it("two players at the same rounded handicap both get 0 pops on every hole", () => {
    // Setup: Michael 8.0 → 8, Todd 7.8 → 8 (post-fix). Both are
    // tied lowest. getStrokesOnHole(8, 8, anyRank, 100) → 0.
    const lowest = 8;
    for (let rank = 1; rank <= 18; rank++) {
      expect(
        getStrokesOnHole(8, lowest, rank, 100),
        `Michael (handicap 8) on hole rank ${rank}: expected 0 pops`,
      ).toBe(0);
      expect(
        getStrokesOnHole(8, lowest, rank, 100),
        `Todd (handicap 8) on hole rank ${rank}: expected 0 pops`,
      ).toBe(0);
    }
  });
});

// ------------------------------------------------------------
// Block 4 — Pop distribution per hole rank, post-rounding.
// ------------------------------------------------------------

describe("Pop distribution by hole rank — getStrokesOnHole math intact post-fix", () => {
  it("Jonathan (14, diff 6 vs lowest 8): 1 stroke on hole ranks 1-6, 0 on ranks 7-18", () => {
    const hcp = 14;
    const lowest = 8;
    // diff = 6 → strokes on hardest 6 holes (rank 1..6)
    for (let rank = 1; rank <= 6; rank++) {
      expect(
        getStrokesOnHole(hcp, lowest, rank, 100),
        `Jonathan on rank ${rank}: 1 pop expected`,
      ).toBe(1);
    }
    for (let rank = 7; rank <= 18; rank++) {
      expect(
        getStrokesOnHole(hcp, lowest, rank, 100),
        `Jonathan on rank ${rank}: 0 pops expected`,
      ).toBe(0);
    }
  });

  it("Nicholas (18, diff 10 vs lowest 8): 1 stroke on hole ranks 1-10, 0 on ranks 11-18", () => {
    const hcp = 18;
    const lowest = 8;
    for (let rank = 1; rank <= 10; rank++) {
      expect(getStrokesOnHole(hcp, lowest, rank, 100)).toBe(1);
    }
    for (let rank = 11; rank <= 18; rank++) {
      expect(getStrokesOnHole(hcp, lowest, rank, 100)).toBe(0);
    }
  });
});

// ------------------------------------------------------------
// Block 5 — Backwards compatibility: pre-PR-#32 rounds keep their
// floored handicaps in playerConfig. Replays use the stored value.
// ------------------------------------------------------------

describe("Backwards compatibility — pre-PR-#32 rounds replay with floored handicaps unchanged", () => {
  it("a legacy round with stored handicap 7 (from raw 7.8 floor) replays at 7", () => {
    // The fix changes future round-start writes only. Existing
    // playerConfig blobs in the DB keep their floored values. The
    // engine reads stored value as-is; no recalculation. Verify
    // the engine produces the same strokes for stored=7 (legacy)
    // post-fix as it did pre-fix.
    //
    // Lowest handicap = 7 (legacy). Diff for player at 7 = 0 → 0 strokes.
    expect(getStrokesOnHole(7, 7, 1, 100)).toBe(0);
    // Lowest = 7. Player at 8: diff = 1 → 1 stroke on rank 1.
    expect(getStrokesOnHole(8, 7, 1, 100)).toBe(1);
    expect(getStrokesOnHole(8, 7, 2, 100)).toBe(0);
  });

  it("the engine's own Math.round inside getStrokesOnHole is unchanged", () => {
    // PR #32 only touches the round-start scaling in db.ts. The
    // engine's Math.round in getStrokesOnHole stays as-is.
    const enginesource = readFile("supabase/functions/_shared/gameEngines.ts");
    expect(enginesource).toMatch(/const adjustedHandicap = Math\.round\(playerHandicap \* handicapPercent \/ 100\)/);
    expect(enginesource).toMatch(/const adjustedLowest = Math\.round\(lowestHandicap \* handicapPercent \/ 100\)/);
  });
});

// ------------------------------------------------------------
// Block 6 — Real on-course case: full round simulation.
// ------------------------------------------------------------

describe("Real on-course case (Jonathan's 2026-04-29 round)", () => {
  it("13.6 / 8.0 / 7.8 / 17.9 produces 14 / 8 / 8 / 18 with Michael & Todd tied for lowest, both at 0 pops", () => {
    const round = (raw: number): number => Math.round(raw);
    const jonathan = round(13.6);
    const michael = round(8.0);
    const todd = round(7.8);
    const nicholas = round(17.9);

    expect(jonathan, "Jonathan 13.6 → 14").toBe(14);
    expect(michael, "Michael 8.0 → 8").toBe(8);
    expect(todd, "Todd 7.8 → 8").toBe(8);
    expect(nicholas, "Nicholas 17.9 → 18").toBe(18);

    const lowest = Math.min(jonathan, michael, todd, nicholas);
    expect(lowest, "lowest (tied) is 8").toBe(8);

    // Sum strokes across all 18 holes (1-indexed handicap ranks).
    const totalPops = (hcp: number): number => {
      let sum = 0;
      for (let r = 1; r <= 18; r++) sum += getStrokesOnHole(hcp, lowest, r, 100);
      return sum;
    };

    expect(totalPops(jonathan), "Jonathan: 14-8 = 6 pops").toBe(6);
    expect(totalPops(michael), "Michael: tied lowest → 0 pops").toBe(0);
    expect(totalPops(todd), "Todd: tied lowest → 0 pops").toBe(0);
    expect(totalPops(nicholas), "Nicholas: 18-8 = 10 pops").toBe(10);
  });
});

// ------------------------------------------------------------
// Block 7 — Source-level: db.ts uses Math.round (not Math.floor)
// at both call sites (startRound + legacy createRound).
// ------------------------------------------------------------

describe("db.ts source-level — Math.round at both round-start scaling sites", () => {
  it("startRound's playerConfig builder uses Math.round((raw * percent) / 100)", () => {
    // The startRound (PR #30 D4-A path) is the canonical write site.
    expect(DB).toMatch(
      /export async function startRound\([\s\S]{0,2000}Math\.round\(\(raw \* percent\) \/ 100\)/,
    );
  });

  it("legacy createRound (deprecated, kept for one PR cycle) also uses Math.round", () => {
    // Deprecated but still present per the PR #30 D4-A keep-and-deprecate.
    // Must use the same rounding rule so the two paths agree if both
    // are accidentally exercised during the deprecation window.
    expect(DB).toMatch(
      /@deprecated PR #30 commit 3 \(D4-A\)[\s\S]{0,3000}Math\.round\(\(raw \* percent\) \/ 100\)/,
    );
  });

  it("no Math.floor((raw * percent) / 100) remains anywhere in db.ts", () => {
    // The smoking gun: floor was the bug. Any reintroduction is a
    // regression.
    expect(DB).not.toMatch(/Math\.floor\(\(raw \* percent\) \/ 100\)/);
  });
});
