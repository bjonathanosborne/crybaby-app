// ============================================================
// Profile name validation (PR #23 D1).
//
// The `require_name_ghin` migration (PR #15) added a
// `profile_completed` flag gated on non-empty first_name +
// last_name + ghin. But "non-empty" passed single-letter names
// like "T" / "B" — which satisfied the gate but produced profiles
// that nobody could find via player search. The on-course bug
// from 2026-04-22 traced back to Todd Bailey's profile storing
// `first_name: "T", last_name: "B"`, invisible to a search for
// "Todd Bailey".
//
// This module tightens the client-side gate + provides a shared
// predicate for ProfileCompletionPage, ProfilePage edit, and
// AuthPage signup. The companion SQL migration
// (20260422000000_stricter_profile_name_check.sql) runs the
// server-side backfill: any existing profile whose names fail the
// predicate below is reset to profile_completed=false so the user
// is re-prompted on next login.
//
// Rules:
//   - Both first_name and last_name must be present
//   - Each must be >= 2 characters AFTER trim
//   - Leading/trailing whitespace is always trimmed (rejects "  T ")
//   - Empty strings, null, undefined are all invalid
//
// Deliberately NOT in scope:
//   - Character-class rules (e.g., "must contain a letter")
//     — complicates i18n and doesn't block real usability
//   - Capitalization enforcement
//   - Duplicate-name detection — two users can share a name
// ============================================================

export const MIN_NAME_CHARS = 2;

export type NameFieldError =
  | "missing"            // null / undefined / empty after trim
  | "too_short"          // < MIN_NAME_CHARS after trim
  | "whitespace_only";   // non-empty but whitespace-only

export interface NameValidationResult {
  firstNameError: NameFieldError | null;
  lastNameError: NameFieldError | null;
  ok: boolean;
}

/**
 * Validate a name field. Returns a specific error token if invalid,
 * null if valid. Callers use the token for UI copy + save-gate.
 */
function validateNameField(raw: string | null | undefined): NameFieldError | null {
  if (raw === null || raw === undefined) return "missing";
  if (raw === "") return "missing";
  const trimmed = raw.trim();
  if (trimmed === "") return "whitespace_only";
  if (trimmed.length < MIN_NAME_CHARS) return "too_short";
  return null;
}

/**
 * Validate both name fields at once. Returns a composite result —
 * per-field errors + a single `ok` flag callers can bind to the
 * Save button's disabled state.
 */
export function validateProfileNames(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): NameValidationResult {
  const firstNameError = validateNameField(firstName);
  const lastNameError = validateNameField(lastName);
  return {
    firstNameError,
    lastNameError,
    ok: firstNameError === null && lastNameError === null,
  };
}

/**
 * Translate a NameFieldError token into user-facing copy.
 * Centralized here so all three surfaces (completion page,
 * profile edit, auth signup) show identical wording.
 */
export function nameErrorMessage(error: NameFieldError | null): string {
  if (error === null) return "";
  switch (error) {
    case "missing":
    case "whitespace_only":
      return "Required — enter your name.";
    case "too_short":
      return `Too short — at least ${MIN_NAME_CHARS} characters.`;
  }
}
