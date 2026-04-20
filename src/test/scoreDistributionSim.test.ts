import { describe, it, expect } from "vitest";
import type { UserScoreDistribution } from "@/lib/db";

/**
 * TS port of the get_user_score_distribution SQL algorithm.
 *
 * We cannot run Postgres from this harness, but we CAN lock in the
 * bucketing rules + shape-handling by simulating the function's
 * algorithm on mock data that matches real SoloRound / DOC writes.
 *
 * If Solo's data shape (object hole_scores keyed "1".."18") ever
 * silently produces zero holes here, the same symptom would re-appear
 * in the live function.
 *
 * Mirror of the SQL in:
 *   supabase/migrations/20260419050000_fix_get_user_score_distribution.sql
 */

type HoleScores = Record<string, number> | number[];

interface SimRound {
  hole_scores: HoleScores;
  pars: number[];
}

function simulate(p_user_rounds: SimRound[]): UserScoreDistribution {
  const buckets: UserScoreDistribution = {
    ace: 0,
    eagle: 0,
    birdie: 0,
    pars: 0,
    bogey: 0,
    double_bogey: 0,
    triple_plus: 0,
    total_holes: 0,
  };

  for (const round of p_user_rounds) {
    if (!Array.isArray(round.pars) || round.pars.length === 0) continue;
    const hs = round.hole_scores;
    const isArray = Array.isArray(hs);
    const isObject = !isArray && hs !== null && typeof hs === "object";
    if (!isArray && !isObject) continue;

    for (let hole_num = 1; hole_num <= round.pars.length; hole_num++) {
      // Score lookup — mirrors the SQL CASE on jsonb_typeof
      let score: number | null = null;
      if (isObject) {
        const v = (hs as Record<string, number>)[String(hole_num)];
        score = typeof v === "number" && Number.isFinite(v) ? v : null;
      } else if (isArray) {
        const v = (hs as number[])[hole_num - 1];
        score = typeof v === "number" && Number.isFinite(v) ? v : null;
      }
      const par = round.pars[hole_num - 1] ?? null;
      if (score == null || par == null || score <= 0 || par <= 0) continue;

      // Bucketing rules — mirrors the SQL COUNT FILTERs
      buckets.total_holes += 1;
      if (score === 1 && par >= 3) {
        buckets.ace += 1;
      } else if (score - par <= -2) {
        buckets.eagle += 1;
      } else if (score - par === -1) {
        buckets.birdie += 1;
      } else if (score - par === 0) {
        buckets.pars += 1;
      } else if (score - par === 1) {
        buckets.bogey += 1;
      } else if (score - par === 2) {
        buckets.double_bogey += 1;
      } else if (score - par >= 3) {
        buckets.triple_plus += 1;
      }
    }
  }

  return buckets;
}

// ============================================================
// Fixture: a real Solo round shape from SoloRound.finishRound
// ============================================================

const JOHN_PARS = [4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];

const SOLO_OBJECT: SimRound = {
  // Shape exactly matches `SoloRound.jsx:97-98`:
  //   const holeScores = {};
  //   scores.forEach((s, i) => { holeScores[String(i + 1)] = s; });
  hole_scores: {
    "1": 5, "2": 3, "3": 4, "4": 6, "5": 4, "6": 5, "7": 3, "8": 5, "9": 5,
    "10": 5, "11": 4, "12": 5, "13": 5, "14": 4, "15": 5, "16": 4, "17": 5, "18": 6,
  },
  pars: JOHN_PARS,
};

// ============================================================
// Tests
// ============================================================

describe("get_user_score_distribution — algorithm simulation", () => {
  it("produces a non-empty distribution for a Solo round (bug #13 regression)", () => {
    const d = simulate([SOLO_OBJECT]);
    expect(d.total_holes).toBe(18);
    // Score 5 on par 4 = +1 = bogey, seven of those; plus the par-3 3 is par,
    // the par-5 6s are +1 bogeys, etc. The exact counts are less important
    // than "not zero".
    expect(d.ace + d.eagle + d.birdie + d.pars + d.bogey + d.double_bogey + d.triple_plus)
      .toBe(18);
  });

  it("sums to total_holes across all seven buckets", () => {
    const d = simulate([SOLO_OBJECT]);
    const sum = d.ace + d.eagle + d.birdie + d.pars + d.bogey + d.double_bogey + d.triple_plus;
    expect(sum).toBe(d.total_holes);
  });

  it("bucket-by-bucket check on a handcrafted scorecard", () => {
    const r: SimRound = {
      hole_scores: {
        "1": 1,   // ace on par 3
        "2": 2,   // eagle on par 4 (-2)
        "3": 3,   // birdie on par 4 (-1)
        "4": 4,   // par on par 4
        "5": 5,   // bogey on par 4
        "6": 6,   // double on par 4
        "7": 7,   // triple+ on par 4
        "8": 1,   // ace on par 3 (same bucket as #1)
        "9": 8,   // triple+ on par 4 (+4)
      },
      pars: [3, 4, 4, 4, 4, 4, 4, 3, 4],
    };
    const d = simulate([r]);
    expect(d.ace).toBe(2);
    expect(d.eagle).toBe(1);
    expect(d.birdie).toBe(1);
    expect(d.pars).toBe(1);
    expect(d.bogey).toBe(1);
    expect(d.double_bogey).toBe(1);
    expect(d.triple_plus).toBe(2);
    expect(d.total_holes).toBe(9);
  });

  it("handles array-form hole_scores (matches jsonb array branch)", () => {
    const r: SimRound = {
      hole_scores: [4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5],
      pars: JOHN_PARS,
    };
    const d = simulate([r]);
    // All scores match par exactly.
    expect(d.pars).toBe(18);
    expect(d.total_holes).toBe(18);
  });

  it("handles 9-hole rounds (pars.length < 18)", () => {
    const r: SimRound = {
      hole_scores: { "1": 4, "2": 3, "3": 4, "4": 5, "5": 4, "6": 4, "7": 3, "8": 4, "9": 5 },
      pars: [4, 3, 4, 5, 4, 4, 3, 4, 5],
    };
    const d = simulate([r]);
    expect(d.total_holes).toBe(9);
    expect(d.pars).toBe(9); // all match par
  });

  it("skips holes where score <= 0 (unscored) or par <= 0 (malformed)", () => {
    const r: SimRound = {
      hole_scores: { "1": 4, "2": 0, "3": 4 }, // hole 2 unscored
      pars: [4, 0, 4], // hole 2 par zero
    };
    const d = simulate([r]);
    expect(d.total_holes).toBe(2);
  });

  it("skips rounds with no pars array (malformed course_details)", () => {
    const r: SimRound = { hole_scores: { "1": 4 }, pars: [] };
    const d = simulate([r]);
    expect(d.total_holes).toBe(0);
  });

  it("aggregates across multiple rounds", () => {
    const d = simulate([SOLO_OBJECT, SOLO_OBJECT, SOLO_OBJECT]);
    expect(d.total_holes).toBe(54);
  });

  it("par-2 ace does NOT count as ace (par >= 3 rule)", () => {
    // Defensive: real golf has no par 2s, but the rule should still hold
    // so a weird data entry doesn't distort the ace count.
    const r: SimRound = { hole_scores: { "1": 1 }, pars: [2] };
    const d = simulate([r]);
    expect(d.ace).toBe(0);
    expect(d.birdie).toBe(1); // 1 on a par 2 is par-1 = birdie.
  });
});

// ============================================================
// Migration shape + regression guards
// ============================================================

describe("Migration 20260419050000 — fix shape", () => {
  it("uses generate_series (not nested LATERAL) for the hole iteration", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260419050000_fix_get_user_score_distribution.sql"),
      "utf-8",
    );
    // The whole point of the rewrite: ditch the CROSS JOIN LATERAL
    // jsonb_each pattern. Require generate_series and forbid jsonb_each.
    expect(src).toMatch(/generate_series\s*\(\s*1\s*,/);
    expect(src).not.toMatch(/jsonb_each\s*\(/);
  });

  it("branches on jsonb_typeof(hole_scores) for both object and array shapes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260419050000_fix_get_user_score_distribution.sql"),
      "utf-8",
    );
    expect(src).toMatch(/jsonb_typeof\(rp\.hole_scores\)\s*=\s*'object'/);
    expect(src).toMatch(/jsonb_typeof\(rp\.hole_scores\)\s*=\s*'array'/);
  });

  it("has the same 8 return columns and bucket rules as the original", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260419050000_fix_get_user_score_distribution.sql"),
      "utf-8",
    );
    for (const col of ["ace", "eagle", "birdie", "pars", "bogey", "double_bogey", "triple_plus", "total_holes"]) {
      expect(src).toContain(col);
    }
    expect(src).toMatch(/score\s*=\s*1\s+AND\s+par\s*>=\s*3/);
    expect(src).toMatch(/\(score\s*-\s*par\)\s*>=\s*3/);
  });

  it("grants EXECUTE to authenticated, marked SECURITY DEFINER", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260419050000_fix_get_user_score_distribution.sql"),
      "utf-8",
    );
    expect(src).toMatch(/SECURITY DEFINER/);
    expect(src).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_user_score_distribution\(uuid\)\s+TO\s+authenticated/);
  });

  it("handles non-array pars defensively via generate_series(1, 0)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260419050000_fix_get_user_score_distribution.sql"),
      "utf-8",
    );
    // The CASE inside generate_series returns 0 for non-array pars.
    // generate_series(1, 0) yields zero rows rather than throwing.
    // Assert the three building blocks separately (regex with comments +
    // line breaks is brittle as a single pattern).
    expect(src).toMatch(/CASE\s+WHEN\s+jsonb_typeof\(r\.course_details\s*->\s*'pars'\)\s*=\s*'array'/);
    expect(src).toMatch(/THEN\s+jsonb_array_length\(r\.course_details\s*->\s*'pars'\)/);
    expect(src).toMatch(/ELSE\s+0\s+END/);
  });
});

// ============================================================
// StatsPage — client-side error hardening
// ============================================================

describe("StatsPage — client-side error hardening", () => {
  it("no longer silently nulls errors (toasts with real detail)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/StatsPage.tsx"),
      "utf-8",
    );
    // The old `.catch(() => null)` silent-swallow must not be present
    // for any RPC call in the Promise.all.
    expect(src).not.toMatch(/loadUserScoreDistribution\(\)\.catch\(\(\)\s*=>\s*null\)/);
    expect(src).not.toMatch(/loadUserStats\(\)\.catch\(\(\)\s*=>\s*null\)/);
  });

  it("every RPC call in the Promise.all is wrapped by resilient()", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/StatsPage.tsx"),
      "utf-8",
    );
    // The Promise.all block must wrap loadProfile, loadMyRounds,
    // loadSettlements, loadUserStats, and loadUserScoreDistribution
    // each in resilient() — so a single RPC failure cannot blank the page.
    expect(src).toMatch(/resilient\(loadProfile\(\)/);
    expect(src).toMatch(/resilient\(loadMyRounds\(/);
    expect(src).toMatch(/resilient\(loadSettlements\(\)/);
    expect(src).toMatch(/resilient\(loadUserStats\(\)/);
    expect(src).toMatch(/resilient\(loadUserScoreDistribution\(\)/);
  });

  it("resilient() toasts with PostgrestError detail (message + code + hint)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/StatsPage.tsx"),
      "utf-8",
    );
    // formatRpcError must handle the PostgrestError shape — not just Error
    // instances. Prior failure mode: err from supabase-js was a plain object
    // so instanceof Error was false and the toast said "Unknown error".
    expect(src).toMatch(/function formatRpcError\(err:\s*unknown\)/);
    expect(src).toMatch(/typeof err\s*===\s*"object"/);
    // Should pull message, code, and hint fields off the object.
    expect(src).toMatch(/e\.message/);
    expect(src).toMatch(/e\.code/);
    expect(src).toMatch(/e\.hint/);
  });

  it("resilient() logs + toasts + returns null without rejecting", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/StatsPage.tsx"),
      "utf-8",
    );
    const fn = src.match(/function resilient<T>\(p:\s*Promise<T>[\s\S]*?\n\}/);
    expect(fn).toBeTruthy();
    const body = fn?.[0] ?? "";
    expect(body).toMatch(/console\.error/);
    expect(body).toMatch(/toast\(/);
    expect(body).toMatch(/return\s+null/);
    expect(body).toMatch(/variant:\s*"destructive"/);
  });
});
