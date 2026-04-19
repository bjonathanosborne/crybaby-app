// ============================================================
// Pure score-category bucketing for the scorecard + grid views.
//
// Mirrors the app's overall scoring taxonomy:
//   ace         — hole-in-one (score = 1 AND par >= 3). Highlighted cell.
//   eagle       — (par - score) >= 2 (excluding aces). Double-circle.
//   birdie      — (par - score) == 1. Single-circle.
//   par         — (par - score) == 0. No decoration.
//   bogey       — (score - par) == 1. Square outline.
//   doublePlus  — (score - par) >= 2. Filled square.
//   none        — score not yet entered (0, null, undefined).
// ============================================================

export type ScoreCategory =
  | "ace"
  | "eagle"
  | "birdie"
  | "par"
  | "bogey"
  | "doublePlus"
  | "none";

export function categorize(score: number | null | undefined, par: number | null | undefined): ScoreCategory {
  if (score == null || score <= 0) return "none";
  if (par == null || par <= 0) return "none";
  if (score === 1 && par >= 3) return "ace";
  const diff = score - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "doublePlus";
}

/** Normalise the various hole_scores shapes into a length-18 number array. */
export function normaliseHoleScores(raw: Record<string, number> | number[] | null | undefined, expectedLen = 18): number[] {
  if (Array.isArray(raw)) {
    const out = raw.slice(0, expectedLen);
    while (out.length < expectedLen) out.push(0);
    return out;
  }
  if (raw && typeof raw === "object") {
    const out = Array<number>(expectedLen).fill(0);
    for (const [k, v] of Object.entries(raw)) {
      const idx = Number(k) - 1;
      if (Number.isFinite(idx) && idx >= 0 && idx < expectedLen) {
        out[idx] = Number(v) || 0;
      }
    }
    return out;
  }
  return Array<number>(expectedLen).fill(0);
}

/** Sum with a default of 0 for any invalid cells. */
export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + (b || 0), 0);
}

/** Diff symbol: +N / E / -N. Returns null for 0 when wantE is false. */
export function diffSymbol(diff: number): string {
  if (diff === 0) return "E";
  if (diff > 0) return `+${diff}`;
  return String(diff);
}
