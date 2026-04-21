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
