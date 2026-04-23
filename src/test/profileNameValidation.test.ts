import { describe, it, expect } from "vitest";
import {
  validateProfileNames,
  nameErrorMessage,
  MIN_NAME_CHARS,
} from "@/lib/profileNameValidation";

// ============================================================
// PR #23 commit 3 (D1) — profile name validation.
//
// Tightens the completion-gate rule from "non-empty" (which
// accepted single-letter "T"/"B") to ">= 2 chars after trim".
// Shared by ProfileCompletionPage + ProfilePage edit + AuthPage
// signup so all three surfaces enforce the same rule.
// ============================================================

describe("validateProfileNames — valid cases", () => {
  it("two full names → ok", () => {
    const r = validateProfileNames("Jonathan", "Osborne");
    expect(r.ok).toBe(true);
    expect(r.firstNameError).toBeNull();
    expect(r.lastNameError).toBeNull();
  });

  it("exactly 2 chars each → ok (boundary)", () => {
    expect(validateProfileNames("Jo", "Os").ok).toBe(true);
  });

  it("names with internal whitespace → ok", () => {
    expect(validateProfileNames("Mary Ann", "Van Buren").ok).toBe(true);
  });

  it("constants match spec", () => {
    expect(MIN_NAME_CHARS).toBe(2);
  });
});

describe("validateProfileNames — too short", () => {
  it("single-character first name → too_short", () => {
    const r = validateProfileNames("T", "Bailey");
    expect(r.ok).toBe(false);
    expect(r.firstNameError).toBe("too_short");
    expect(r.lastNameError).toBeNull();
  });

  it("single-character last name → too_short", () => {
    const r = validateProfileNames("Todd", "B");
    expect(r.firstNameError).toBeNull();
    expect(r.lastNameError).toBe("too_short");
    expect(r.ok).toBe(false);
  });

  it("both single-character → both errors (Todd's profile exactly)", () => {
    const r = validateProfileNames("T", "B");
    expect(r.firstNameError).toBe("too_short");
    expect(r.lastNameError).toBe("too_short");
    expect(r.ok).toBe(false);
  });

  it("whitespace-padded single char → too_short (' T ' trims to 'T')", () => {
    expect(validateProfileNames(" T ", "Bailey").firstNameError).toBe("too_short");
  });
});

describe("validateProfileNames — missing / whitespace-only", () => {
  it("null first name → missing", () => {
    expect(validateProfileNames(null, "Bailey").firstNameError).toBe("missing");
  });

  it("undefined last name → missing", () => {
    expect(validateProfileNames("Todd", undefined).lastNameError).toBe("missing");
  });

  it("empty string → missing", () => {
    expect(validateProfileNames("", "Bailey").firstNameError).toBe("missing");
  });

  it("whitespace-only → whitespace_only", () => {
    expect(validateProfileNames("   ", "Bailey").firstNameError).toBe("whitespace_only");
    expect(validateProfileNames("Todd", "\t\n").lastNameError).toBe("whitespace_only");
  });
});

describe("nameErrorMessage — UI copy", () => {
  it("null → empty string (nothing to render)", () => {
    expect(nameErrorMessage(null)).toBe("");
  });

  it("missing + whitespace_only → same friendly 'Required' copy", () => {
    expect(nameErrorMessage("missing")).toMatch(/[Rr]equired/);
    expect(nameErrorMessage("whitespace_only")).toMatch(/[Rr]equired/);
  });

  it("too_short → mentions 2 chars", () => {
    expect(nameErrorMessage("too_short")).toMatch(/2 characters/i);
  });
});

// ============================================================
// Source-level wiring — ProfileCompletionPage + ProfilePage edit
// ============================================================

async function readSrc(rel: string): Promise<string> {
  const fs = await import("fs");
  const path = await import("path");
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

describe("ProfileCompletionPage — stricter gate (source-level)", () => {
  it("imports validateProfileNames + nameErrorMessage from shared module", async () => {
    const src = await readSrc("src/pages/ProfileCompletionPage.tsx");
    expect(src).toMatch(
      /import \{ validateProfileNames, nameErrorMessage \} from "@\/lib\/profileNameValidation"/,
    );
  });

  it("nameValidation memo is bound to firstName + lastName state", async () => {
    const src = await readSrc("src/pages/ProfileCompletionPage.tsx");
    expect(src).toMatch(/validateProfileNames\(firstName, lastName\)/);
  });

  it("canSubmit is gated on nameValidation.ok", async () => {
    const src = await readSrc("src/pages/ProfileCompletionPage.tsx");
    expect(src).toMatch(/canSubmit = nameValidation\.ok/);
  });

  it("per-field error elements render with testids + role=alert", async () => {
    const src = await readSrc("src/pages/ProfileCompletionPage.tsx");
    expect(src).toMatch(/data-testid="profile-completion-first-name-error"/);
    expect(src).toMatch(/data-testid="profile-completion-last-name-error"/);
    // Both error divs have role="alert" for screen readers
    const alertCount = (src.match(/role="alert"/g) || []).length;
    expect(alertCount).toBeGreaterThanOrEqual(2);
  });

  it("errors only show after the user types (avoid flash-on-mount)", async () => {
    const src = await readSrc("src/pages/ProfileCompletionPage.tsx");
    expect(src).toMatch(/showFirstNameError = firstName\.length > 0/);
    expect(src).toMatch(/showLastNameError = lastName\.length > 0/);
  });
});

describe("ProfilePage — save gate rejects single-letter names (source-level)", () => {
  it("imports the shared validator", async () => {
    const src = await readSrc("src/pages/ProfilePage.tsx");
    expect(src).toMatch(
      /import \{ validateProfileNames, nameErrorMessage \} from "@\/lib\/profileNameValidation"/,
    );
  });

  it("handleSaveProfile short-circuits when nameValidation.ok is false", async () => {
    const src = await readSrc("src/pages/ProfilePage.tsx");
    // The guard fires BEFORE the updateProfile call.
    const handlerStart = src.indexOf("const handleSaveProfile");
    const guard = src.indexOf("if (!nameValidation.ok)", handlerStart);
    const updateCall = src.indexOf("updateProfile(", handlerStart);
    expect(guard).toBeGreaterThan(handlerStart);
    expect(guard).toBeLessThan(updateCall);
  });

  it("isComplete now requires nameValidation.ok (not just non-empty strings)", async () => {
    const src = await readSrc("src/pages/ProfilePage.tsx");
    expect(src).toMatch(/const isComplete = nameValidation\.ok && !!editForm\.ghin\?\.trim\(\)/);
  });
});

// ============================================================
// Search RPC migration (source-level)
// ============================================================

describe("search_users_concatenated_name migration (source-level)", () => {
  it("drops the old function before recreating (required by Postgres for signature changes)", async () => {
    const src = await readSrc("supabase/migrations/20260422010000_search_users_concatenated_name.sql");
    expect(src).toMatch(/DROP FUNCTION IF EXISTS public\.search_users_by_name\(text\)/);
  });

  it("adds the concatenated-name clause", async () => {
    const src = await readSrc("supabase/migrations/20260422010000_search_users_concatenated_name.sql");
    // The clause combines first_name + ' ' + last_name via COALESCE guards
    expect(src).toMatch(
      /\(COALESCE\(p\.first_name, ''\) \|\| ' ' \|\| COALESCE\(p\.last_name, ''\)\) ILIKE/,
    );
  });

  it("preserves the existing field-level match clauses (regression guard)", async () => {
    const src = await readSrc("supabase/migrations/20260422010000_search_users_concatenated_name.sql");
    // Single-word "Todd" must still hit via p.first_name ILIKE.
    expect(src).toMatch(/p\.first_name ILIKE '%' \|\| _query \|\| '%'/);
    expect(src).toMatch(/p\.last_name ILIKE '%' \|\| _query \|\| '%'/);
    expect(src).toMatch(/p\.display_name ILIKE '%' \|\| _query \|\| '%'/);
  });

  it("keeps SECURITY DEFINER + self-exclusion + LIMIT 30 (same shape)", async () => {
    const src = await readSrc("supabase/migrations/20260422010000_search_users_concatenated_name.sql");
    expect(src).toMatch(/STABLE SECURITY DEFINER/);
    expect(src).toMatch(/WHERE p\.user_id != auth\.uid\(\)/);
    expect(src).toMatch(/LIMIT 30/);
  });

  it("grants EXECUTE to authenticated role", async () => {
    const src = await readSrc("supabase/migrations/20260422010000_search_users_concatenated_name.sql");
    expect(src).toMatch(/GRANT EXECUTE ON FUNCTION public\.search_users_by_name\(text\) TO authenticated/);
  });

  it("tracker insert uses three-column shape + ON CONFLICT", async () => {
    const src = await readSrc("supabase/migrations/20260422010000_search_users_concatenated_name.sql");
    expect(src).toMatch(
      /INSERT INTO supabase_migrations\.schema_migrations \(version, name, statements\)[\s\S]*?ON CONFLICT \(version\) DO NOTHING/,
    );
  });
});

describe("backfill_malformed_profile_names migration (source-level)", () => {
  it("trims whitespace BEFORE the length check", async () => {
    const src = await readSrc("supabase/migrations/20260422000000_backfill_malformed_profile_names.sql");
    const trimPos = src.indexOf("first_name = TRIM");
    const lengthCheckPos = src.indexOf("char_length(TRIM(first_name))");
    expect(trimPos).toBeGreaterThan(0);
    expect(lengthCheckPos).toBeGreaterThan(trimPos);
  });

  it("only flips true → false; preserves already-completed good profiles", async () => {
    const src = await readSrc("supabase/migrations/20260422000000_backfill_malformed_profile_names.sql");
    // WHERE profile_completed = true AND (…invalid) — must include the
    // true-filter so valid rows are untouched.
    expect(src).toMatch(/WHERE profile_completed = true[\s\S]*?char_length/);
  });

  it("checks both first_name AND last_name for the 2-char minimum", async () => {
    const src = await readSrc("supabase/migrations/20260422000000_backfill_malformed_profile_names.sql");
    expect(src).toMatch(/char_length\(TRIM\(first_name\)\), 0\) < 2/);
    expect(src).toMatch(/char_length\(TRIM\(last_name\)\), 0\) < 2/);
  });

  it("tracker row inserted with ON CONFLICT", async () => {
    const src = await readSrc("supabase/migrations/20260422000000_backfill_malformed_profile_names.sql");
    expect(src).toMatch(
      /INSERT INTO supabase_migrations\.schema_migrations \(version, name, statements\)[\s\S]*?ON CONFLICT \(version\) DO NOTHING/,
    );
  });
});
