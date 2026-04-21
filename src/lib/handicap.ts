// ============================================================
// Handicap — shared validation + display helpers.
//
// Used by ProfilePage (self-edit), CrybabySetupWizard (per-player
// round-start locking), and tests. Keeping the rules in one module
// means a bounds change (e.g. allowing -10 again) is a one-line edit
// that ripples through every surface consistently.
//
// Single source of truth:
//   - Range: -5.0 to 54.0 (USGA handicap index bounds for casual)
//   - Step:  0.1          (finest granularity the USGA publishes)
//   - Empty: allowed everywhere ("not yet set" is a real state;
//            new users never default to 0)
//
// `validateHandicapInput` returns a discriminated union the UI
// consumes to drive inline error copy. It never mutates; callers
// keep the raw string in state so the user can fix typos.
// ============================================================

export const HANDICAP_MIN = -5.0;
export const HANDICAP_MAX = 54.0;
export const HANDICAP_STEP = 0.1;
export const HANDICAP_ERROR_MSG = "Handicap must be between -5 and 54.";

export type HandicapValidation =
  | { ok: true; kind: "empty"; value: null }
  | { ok: true; kind: "valid"; value: number }
  | { ok: false; kind: "invalid"; reason: string };

/**
 * Validate a raw handicap input string. Empty string → empty (valid).
 * Non-numeric, out-of-range, or NaN → invalid with a UI-ready reason.
 *
 * Note: we only flag RANGE violations with `HANDICAP_ERROR_MSG` because
 * that's what the spec renders inline. "Non-numeric" typically can't
 * happen on `<input type="number">` (the browser blocks non-digit chars
 * before state update) — but we still handle it defensively.
 */
export function validateHandicapInput(raw: string): HandicapValidation {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, kind: "empty", value: null };

  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return { ok: false, kind: "invalid", reason: HANDICAP_ERROR_MSG };
  }
  if (num < HANDICAP_MIN || num > HANDICAP_MAX) {
    return { ok: false, kind: "invalid", reason: HANDICAP_ERROR_MSG };
  }
  return { ok: true, kind: "valid", value: num };
}

/**
 * Render a handicap numeric value for display. Handles:
 *   - null / undefined          → empty string (not "NaN", not "null")
 *   - NaN                       → empty string
 *   - integer-valued (e.g. 12)  → "12.0" for typography consistency
 *   - fractional (e.g. 12.3)    → "12.3"
 *
 * Used by profile cards, round detail, and anywhere a handicap number
 * is surfaced in read-only text.
 */
export function formatHandicap(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toFixed(1);
}

/**
 * True when a player's linked profile has no handicap set and the
 * scorekeeper should be prompted to enter a round-specific value.
 *
 * Guests (no userId) don't show the prompt — a null handicap on a
 * guest row is the default starting state, not a gap to fill.
 */
export function needsRoundSpecificHandicapPrompt(
  player: { userId?: string | null; handicap?: number | null },
): boolean {
  const hasUserId = Boolean(player.userId);
  const hasHandicap = player.handicap !== null && player.handicap !== undefined;
  return hasUserId && !hasHandicap;
}

// ============================================================
// Per-round percentage scaling (PR #17 commit 2)
//
// Separate invariant from the handicap-range bounds above. The
// percentage scales a player's raw profile handicap DOWN at round
// start — applied once, locked, never recomputed mid-round.
//
// Legacy rounds written before `rounds.handicap_percent` existed
// read through `resolveHandicapPercent` which falls back to the
// old `course_details.mechanicSettings.pops.handicapPercent`
// location and finally to 100. This keeps replay equivalence for
// every round already in the DB without a data migration.
// ============================================================

export const HANDICAP_PERCENT_MIN = 50;
export const HANDICAP_PERCENT_MAX = 100;
export const HANDICAP_PERCENT_STEP = 5;
export const HANDICAP_PERCENT_DEFAULT = 100;

/**
 * Scale a raw handicap by a percentage. Uses `Math.floor` so a
 * 13-index at 80% becomes 10 (not 11) — the stricter-for-the-field
 * rounding matches standard team-game practice. Always-round-down
 * also yields consistent integer strokes without the pops engine
 * having to re-round.
 *
 * Negative handicaps (plus players) also floor-toward-negative-
 * infinity, so a -2 at 80% becomes -2 (floor(-1.6) = -2), preserving
 * the "fewer strokes given" sign.
 *
 * When `rawHandicap` is null/NaN we return null — callers must
 * propagate the absence rather than substitute a default, so round
 * setup can flag the missing-profile-handicap case explicitly.
 */
export function computeAdjustedHandicap(
  rawHandicap: number | null | undefined,
  percent: number,
): number | null {
  if (rawHandicap === null || rawHandicap === undefined) return null;
  if (!Number.isFinite(rawHandicap)) return null;
  const scaled = (rawHandicap * percent) / 100;
  return Math.floor(scaled);
}

/**
 * Shape of the minimum data this helper reads from a round row.
 * Intentionally structural so callers can pass either the raw
 * Supabase row or a typed bundle without a cast.
 */
export interface RoundHandicapPercentSources {
  /** `rounds.handicap_percent` column. NULL for legacy rounds. */
  handicap_percent?: number | null;
}

export interface CourseDetailsHandicapPercentSources {
  mechanicSettings?: {
    pops?: {
      handicapPercent?: number;
    };
  };
}

/**
 * Fallback hierarchy for reading the handicap percentage:
 *   1. `rounds.handicap_percent`  (authoritative, new world)
 *   2. `course_details.mechanicSettings.pops.handicapPercent`  (legacy)
 *   3. 100  (default for brand-new rounds and anything unsettable)
 *
 * Always returns a finite integer in [50, 100] step 5 for new-world
 * rounds. For legacy rounds the legacy value may be any integer (the
 * old button-tab picker produced 60, 70, 80, 90, 100) — we don't
 * clamp it here because the LIVE values on those rows are the
 * authoritative audit trail; they compute correctly through
 * `computeAdjustedHandicap` regardless of whether they're multiples
 * of 5.
 */
export function resolveHandicapPercent(
  round: RoundHandicapPercentSources | null | undefined,
  courseDetails: CourseDetailsHandicapPercentSources | null | undefined,
): number {
  if (round && round.handicap_percent !== null && round.handicap_percent !== undefined) {
    return round.handicap_percent;
  }
  const legacy = courseDetails?.mechanicSettings?.pops?.handicapPercent;
  if (typeof legacy === "number" && Number.isFinite(legacy)) {
    return legacy;
  }
  return HANDICAP_PERCENT_DEFAULT;
}

/**
 * UI validation: true iff the percentage is a valid slider value.
 * Used by the setup-wizard slider's commit guard and by test
 * assertions that bounds are enforced.
 */
export function isHandicapPercentValid(pct: number): boolean {
  if (!Number.isFinite(pct)) return false;
  if (!Number.isInteger(pct)) return false;
  if (pct < HANDICAP_PERCENT_MIN || pct > HANDICAP_PERCENT_MAX) return false;
  return pct % HANDICAP_PERCENT_STEP === 0;
}

/**
 * True when the round is playing at a non-default percentage and
 * the UI should surface "Playing at X% handicap" rather than
 * suppressing the line. Keeping this as a predicate — rather than
 * inlined at the call site — means a future "100 actually isn't
 * the default here" exception changes only this function.
 */
export function shouldShowHandicapPercentLine(resolvedPercent: number): boolean {
  return resolvedPercent !== HANDICAP_PERCENT_DEFAULT;
}
