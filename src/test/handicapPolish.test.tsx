import { describe, it, expect, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";

import {
  validateHandicapInput,
  formatHandicap,
  needsRoundSpecificHandicapPrompt,
  HANDICAP_MIN,
  HANDICAP_MAX,
  HANDICAP_STEP,
  HANDICAP_ERROR_MSG,
} from "@/lib/handicap";

// ============================================================
// Handicap UI polish — PR #17 commit 1 tests.
//
// Scope:
//   (a) src/lib/handicap.ts primitives — validation, formatting,
//       empty-state prompt predicate
//   (b) ProfilePage handicap field — inline error UX, helper copy,
//       privacy-toggle ordering, save-button guard
//   (c) CrybabySetupWizard — tightened validation (step 0.1, range
//       -5..54), empty-state prompt for linked users with no profile
//       handicap
//   (d) Migration file — 20260420020000_ghin_format_constraint.sql
//       source-level sanity (regex, scrub, CHECK, comment)
// ============================================================

beforeEach(() => cleanup());

// ---------- (a) pure helpers ----------

describe("validateHandicapInput", () => {
  it("empty string is valid (not-yet-set)", () => {
    const r = validateHandicapInput("");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("empty");
      expect(r.value).toBeNull();
    }
  });

  it("whitespace-only string normalises to empty", () => {
    const r = validateHandicapInput("   ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("empty");
  });

  it("mid-range integer valid", () => {
    const r = validateHandicapInput("12");
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "valid") expect(r.value).toBe(12);
  });

  it("mid-range fractional valid", () => {
    const r = validateHandicapInput("12.3");
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "valid") expect(r.value).toBeCloseTo(12.3, 5);
  });

  it("boundary low (-5) valid", () => {
    const r = validateHandicapInput("-5");
    expect(r.ok).toBe(true);
  });

  it("boundary high (54) valid", () => {
    const r = validateHandicapInput("54");
    expect(r.ok).toBe(true);
  });

  it("just below low (-5.1) invalid with canonical message", () => {
    const r = validateHandicapInput("-5.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(HANDICAP_ERROR_MSG);
  });

  it("just above high (54.1) invalid", () => {
    const r = validateHandicapInput("54.1");
    expect(r.ok).toBe(false);
  });

  it("far out of range (100) invalid", () => {
    const r = validateHandicapInput("100");
    expect(r.ok).toBe(false);
  });

  it("non-numeric junk is invalid", () => {
    const r = validateHandicapInput("abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(HANDICAP_ERROR_MSG);
  });

  it("constants match spec (-5 / 54 / 0.1)", () => {
    expect(HANDICAP_MIN).toBe(-5);
    expect(HANDICAP_MAX).toBe(54);
    expect(HANDICAP_STEP).toBe(0.1);
  });
});

describe("formatHandicap", () => {
  it("null → empty string (not 'null' or 'NaN')", () => {
    expect(formatHandicap(null)).toBe("");
  });
  it("undefined → empty string", () => {
    expect(formatHandicap(undefined)).toBe("");
  });
  it("NaN → empty string (defensive)", () => {
    expect(formatHandicap(NaN)).toBe("");
  });
  it("integer renders with one decimal for typography consistency", () => {
    expect(formatHandicap(12)).toBe("12.0");
  });
  it("fractional preserves one decimal", () => {
    expect(formatHandicap(12.3)).toBe("12.3");
  });
  it("negative handicap renders with sign", () => {
    expect(formatHandicap(-2.5)).toBe("-2.5");
  });
  it("zero renders as '0.0' (not empty)", () => {
    expect(formatHandicap(0)).toBe("0.0");
  });
});

describe("needsRoundSpecificHandicapPrompt", () => {
  it("linked user without handicap → prompt", () => {
    expect(needsRoundSpecificHandicapPrompt({ userId: "u1", handicap: null })).toBe(true);
  });
  it("linked user with handicap → no prompt", () => {
    expect(needsRoundSpecificHandicapPrompt({ userId: "u1", handicap: 12 })).toBe(false);
  });
  it("guest without handicap → no prompt", () => {
    expect(needsRoundSpecificHandicapPrompt({ userId: null, handicap: null })).toBe(false);
  });
  it("guest with handicap → no prompt", () => {
    expect(needsRoundSpecificHandicapPrompt({ userId: null, handicap: 12 })).toBe(false);
  });
  it("linked user with undefined handicap → prompt (treats undefined as null)", () => {
    expect(needsRoundSpecificHandicapPrompt({ userId: "u1" })).toBe(true);
  });
});

// ---------- (b) ProfilePage — source-level wiring ----------
//
// Full <ProfilePage /> render tests hang in jsdom on the Supabase auth
// refresh loop (see unhandled-rejection errors in adjacent test files).
// Source-level regex tests exercise the same invariants without the
// async auth noise — the PR #12 profile-polish suite uses the same
// pattern for the round-detail page. When ProfilePage gets decomposed
// post-App Store (TODOS.md P3 architectural debt), these flip back to
// render tests.

// ---------- (c) CrybabySetupWizard polish ----------

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

describe("ProfilePage — handicap polish (source-level)", () => {
  const src = readFile("src/pages/ProfilePage.tsx");

  it("imports validateHandicapInput from the shared module", () => {
    expect(src).toMatch(/import\s*\{\s*validateHandicapInput\s*\}\s*from\s+["']@\/lib\/handicap["']/);
  });

  it("handicap input wired with min=-5, max=54, step=0.1", () => {
    expect(src).toMatch(/data-testid="profile-handicap-input"/);
    expect(src).toMatch(/min=\{-5\}/);
    expect(src).toMatch(/max=\{54\}/);
    expect(src).toMatch(/step=\{0\.1\}/);
  });

  it("handicap input declares inputMode=decimal for mobile numeric keyboard", () => {
    expect(src).toMatch(/inputMode="decimal"/);
  });

  it("inline error element appears when validation fails", () => {
    expect(src).toMatch(/data-testid="profile-handicap-error"/);
    expect(src).toMatch(/!handicapValidation\.ok/);
    expect(src).toMatch(/handicapValidation\.reason/);
  });

  it("helper copy references ghin.com + coming-soon callout", () => {
    expect(src).toMatch(/data-testid="profile-handicap-help"/);
    expect(src).toMatch(/ghin\.com/i);
    expect(src).toMatch(/coming soon/i);
  });

  it("privacy toggle renders AFTER handicap input and BEFORE GHIN input in source order", () => {
    const idxHandicap = src.indexOf('data-testid="profile-handicap-input"');
    const idxToggle = src.indexOf('data-testid="handicap-visibility-toggle"');
    const idxGhin = src.indexOf('data-testid="profile-ghin-input"');
    expect(idxHandicap).toBeGreaterThan(0);
    expect(idxToggle).toBeGreaterThan(idxHandicap);
    expect(idxGhin).toBeGreaterThan(idxToggle);
  });

  it("privacy toggle copy mentions both profiles AND leaderboards", () => {
    expect(src).toMatch(/Show my handicap on friends' profiles and leaderboards/);
  });

  it("save button is gated on handicapValidation.ok", () => {
    expect(src).toMatch(/data-testid="profile-save-button"/);
    expect(src).toMatch(/disabled=\{!handicapValidation\.ok\}/);
  });

  it("handleSaveProfile guards on invalid handicap before calling updateProfile", () => {
    // Guard happens BEFORE the updateProfile call
    const handlerStart = src.indexOf("const handleSaveProfile");
    const guard = src.indexOf("!handicapValidation.ok", handlerStart);
    const updateCall = src.indexOf("updateProfile(", handlerStart);
    expect(guard).toBeGreaterThan(handlerStart);
    expect(guard).toBeLessThan(updateCall);
  });

  it("persisted handicap sources from handicapValidation.value (not raw form string)", () => {
    expect(src).toMatch(/handicap:\s*handicapValidation\.kind\s*===\s*["']valid["']\s*\?\s*handicapValidation\.value\s*:\s*null/);
  });
});

describe("CrybabySetupWizard — tightened handicap validation (source-level)", () => {
  it("min is now -5 (was -10)", () => {
    const src = readFile("src/pages/CrybabySetupWizard.jsx");
    expect(src).toMatch(/min="-5"/);
    // The old -10 bound must be gone from the handicap input
    expect(src).not.toMatch(/min="-10"/);
  });

  it("step is now 0.1 (was 0.5)", () => {
    const src = readFile("src/pages/CrybabySetupWizard.jsx");
    expect(src).toMatch(/step="0\.1"/);
    // The old step="0.5" should be gone from the handicap input
    const stepMatches = src.match(/step="0\.\d"/g) || [];
    expect(stepMatches).not.toContain('step="0.5"');
  });

  it("clamp uses new lower bound (-5)", () => {
    const src = readFile("src/pages/CrybabySetupWizard.jsx");
    expect(src).toMatch(/Math\.max\(\s*-5/);
  });

  it("empty-state prompt renders for linked users with null handicap", () => {
    const src = readFile("src/pages/CrybabySetupWizard.jsx");
    expect(src).toMatch(/player-handicap-empty-prompt-/);
    expect(src).toMatch(/hasn't set a handicap/);
    // Gated on player.userId AND null handicap
    expect(src).toMatch(/player\.userId\s*&&\s*\(player\.handicap\s*===\s*null\s*\|\|\s*player\.handicap\s*===\s*undefined\)/);
  });
});

// ---------- (d) migration file sanity ----------

describe("20260420020000_ghin_format_constraint migration", () => {
  const migration = readFile("supabase/migrations/20260420020000_ghin_format_constraint.sql");

  it("scrubs malformed ghin values to NULL before adding constraint", () => {
    expect(migration).toMatch(/UPDATE public\.profiles[\s\S]*SET ghin = NULL[\s\S]*WHERE ghin IS NOT NULL[\s\S]*ghin !~/);
  });

  it("regex enforces 6-8 digits", () => {
    expect(migration).toMatch(/\^\\d\{6,8\}\$/);
  });

  it("drops any pre-existing constraint of this name for re-runnability", () => {
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS profiles_ghin_format_check/);
  });

  it("adds the CHECK allowing NULL (not-yet-set)", () => {
    expect(migration).toMatch(/ADD CONSTRAINT profiles_ghin_format_check\s*CHECK \(ghin IS NULL OR ghin ~/);
  });

  it("adds an audit COMMENT on the new constraint", () => {
    expect(migration).toMatch(/COMMENT ON CONSTRAINT profiles_ghin_format_check/);
  });

  it("does NOT create a new column (reuses existing profiles.ghin — Option C)", () => {
    // Guard against a future accidental re-introduction of ghin_number
    expect(migration).not.toMatch(/ADD COLUMN[^;]*ghin_number/);
  });
});
