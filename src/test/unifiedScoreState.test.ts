import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #28 — Score-state unification.
//
// PR #27 ripped the photo-capture UI but left two things on the
// table that this file locks down:
//
//   1. A residual capture gate inside useAdvanceHole.ts (zero
//      live callers, but still exporting CaptureRequiredError +
//      a cadence/captureApplied branch). PR #28 commit 1 strips
//      it. The "absent from this hook" assertions live here.
//
//   2. NO regression test guarded the property that score storage
//      is uniform — i.e. that round_players.hole_scores is the
//      same plain Record<number, number> shape regardless of
//      whether it was written by manual entry or apply-capture.
//      A future refactor could re-introduce a {value, source}
//      wrapper or a captured: true flag, and the on-course UX
//      bug Jonathan hit at Sea Island ("captured scores were
//      harder to edit") would be dressed up in code instead of
//      flow friction. These tests prevent that.
//
// All tests here are source-level / shape-level. None of them
// mount components or hit a database. The point is to fail
// loudly the next time someone adds a "this score came from
// capture, treat it specially" branch.
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

// ------------------------------------------------------------
// Block 1 — useAdvanceHole has no capture gate (PR #28 commit 1)
// ------------------------------------------------------------

describe("useAdvanceHole — capture gate removed (PR #28)", () => {
  const SRC = readFile("src/hooks/useAdvanceHole.ts");

  it("does NOT export CaptureRequiredError", () => {
    expect(SRC).not.toMatch(/export\s+class\s+CaptureRequiredError/);
  });

  it("does NOT define a kind = 'capture_required' literal", () => {
    expect(SRC).not.toMatch(/kind\s*=\s*"capture_required"/);
  });

  it("AdvanceResult union does NOT include CaptureRequiredError", () => {
    expect(SRC).not.toMatch(/error:\s*CaptureRequiredError/);
  });

  it("UseAdvanceHoleArgs does NOT take cadence / captureApplied / cadenceReason", () => {
    // The args interface should have no photo-related fields.
    expect(SRC).not.toMatch(/cadence:\s*CaptureCadence/);
    expect(SRC).not.toMatch(/captureApplied:\s*boolean/);
    expect(SRC).not.toMatch(/cadenceReason:\s*string\s*\|\s*null/);
  });

  it("UseAdvanceHoleReturn does NOT expose isBlockedOnPhoto", () => {
    expect(SRC).not.toMatch(/isBlockedOnPhoto:\s*boolean/);
  });

  it("hook body does NOT short-circuit on a capture-required branch", () => {
    expect(SRC).not.toMatch(/isBlockedOnPhoto/);
    expect(SRC).not.toMatch(/new\s+CaptureRequiredError\(/);
  });

  it("does NOT import CaptureCadence (the type that fed the gate)", () => {
    expect(SRC).not.toMatch(/import\s+type\s*\{\s*CaptureCadence\s*\}\s*from/);
  });

  it("removal is documented with a PR #28 marker comment", () => {
    expect(SRC).toMatch(/PR #28[\s\S]{0,400}capture gate/i);
  });
});

// ------------------------------------------------------------
// Block 2 — hole_scores is a plain Record<number, number>
// everywhere. No metadata wrapper, no source flag, no
// captured: true property anywhere on score storage.
// ------------------------------------------------------------

describe("Score storage shape — uniform across writers (PR #28)", () => {
  it("apply-capture writes hole_scores as Record<number, number> (no wrapper)", () => {
    const src = readFile("supabase/functions/apply-capture/index.ts");
    // The write path passes nextScoresByPlayer[rp.id] as hole_scores.
    // Type the structure: Record<string, Record<number, number>>.
    expect(src).toMatch(/nextScoresByPlayer:\s*Record<string,\s*Record<number,\s*number>>/);
    // The write itself:
    expect(src).toMatch(/hole_scores:\s*nextScoresByPlayer\[rp\.id\]/);
    // Sanity: NO wrapper-object writes (e.g. { value: 4, source: 'capture' })
    expect(src).not.toMatch(/source:\s*["']capture["']/);
    expect(src).not.toMatch(/source:\s*["']ocr["']/);
    expect(src).not.toMatch(/captured:\s*true/);
  });

  it("db.ts updatePlayerScores writes the same plain hole_scores shape", () => {
    const src = readFile("src/lib/db.ts");
    // Manual write path. Look for the .update({ hole_scores, total_score })
    // pattern that the apply-capture write also uses.
    expect(src).toMatch(/hole_scores/);
    // No source / captured / origin metadata on score writes
    expect(src).not.toMatch(/source:\s*["'](?:manual|capture|ocr)["']/);
    expect(src).not.toMatch(/score_source\b/);
    expect(src).not.toMatch(/captured_flag/);
  });

  it("RoundEditScores edit path has no source-based gate", () => {
    const src = readFile("src/pages/RoundEditScores.jsx");
    // No imports of capture machinery
    expect(src).not.toMatch(/from\s+["']@\/hooks\/useCapture["']/);
    expect(src).not.toMatch(/from\s+["']@\/components\/capture\//);
    // No checks on score source / origin
    expect(src).not.toMatch(/\.source\s*===\s*["'](?:capture|ocr|manual)["']/);
    expect(src).not.toMatch(/isCaptured\b/);
    expect(src).not.toMatch(/fromCapture\b/);
    expect(src).not.toMatch(/captureId\s*\?/);
    // No conditional disable on the +/- buttons keyed off source
    expect(src).not.toMatch(/disabled=\{[^}]*captured/);
  });

  it("CrybabyActiveRound +/- handlers have no source-based branching", () => {
    const src = readFile("src/pages/CrybabyActiveRound.tsx");
    // Score-edit handlers should not branch on whether a score came from
    // a capture. Search for any pattern that gates editing on origin.
    expect(src).not.toMatch(/score\.source\s*===\s*["'](?:capture|ocr|manual)["']/);
    expect(src).not.toMatch(/score\.captured\s*===\s*true/);
    expect(src).not.toMatch(/score\.fromCapture/);
    expect(src).not.toMatch(/disabled=\{[^}]*\bcaptured\b[^}]*\}/);
  });
});

// ------------------------------------------------------------
// Block 3 — no DB schema column distinguishing captured scores.
// Migration files are scanned for any column on round_players or
// rounds that would carry a per-score source/captured flag.
// ------------------------------------------------------------

describe("Schema — no captured-vs-manual score column (PR #28)", () => {
  function listMigrations(): string[] {
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    return fs.readdirSync(dir).filter(f => f.endsWith(".sql"))
      .map(f => path.join(dir, f));
  }

  it("no migration adds a per-score source / captured / origin column", () => {
    const offenders: string[] = [];
    for (const file of listMigrations()) {
      const src = fs.readFileSync(file, "utf-8");
      // Scan for ALTER TABLE round_players ADD COLUMN ... that would
      // introduce a per-score capture-state field.
      const adds = src.match(/ADD\s+COLUMN[^;]*?(score_source|captured_flag|score_captured|hole_score_source|score_origin|is_captured)\b/gi);
      if (adds && adds.length) {
        offenders.push(`${path.basename(file)}: ${adds.join(", ")}`);
      }
    }
    expect(offenders, `Unexpected per-score capture column added:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("round_players.hole_scores is JSONB (plain map), not a relation to a score-metadata table", () => {
    // Find the migration that originally created round_players.hole_scores.
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql"));
    const hits = files.filter(f => {
      const src = fs.readFileSync(path.join(dir, f), "utf-8");
      return /hole_scores\s+JSONB/i.test(src) || /hole_scores\s+jsonb/i.test(src);
    });
    expect(hits.length, "Expected at least one migration declaring hole_scores JSONB").toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------
// Block 4 — capture_required is dead.
// Setup wizard never writes it; runtime never reads it.
// ------------------------------------------------------------

describe("capture_required flag — dead (PR #28)", () => {
  it("CrybabySetupWizard does NOT write capture_required to course_details or rounds", () => {
    const src = readFile("src/pages/CrybabySetupWizard.jsx");
    expect(src).not.toMatch(/capture_required\s*[:=]/);
    expect(src).not.toMatch(/captureRequired\s*[:=]/);
  });

  it("no runtime code reads a capture_required flag", () => {
    // Scan src/ for any read of capture_required (exclude tests).
    const src = readFile("src/pages/CrybabyActiveRound.tsx");
    expect(src).not.toMatch(/capture_required/);
    const setup = readFile("src/pages/CrybabySetupWizard.jsx");
    expect(setup).not.toMatch(/capture_required/);
  });
});

// ------------------------------------------------------------
// Block 5 — needs_final_photo is dead data.
// PR #27 commit 2 stopped reading it; PR #28 locks that down.
// ------------------------------------------------------------

describe("needs_final_photo — never read by the runtime (PR #28)", () => {
  it("CrybabyActiveRound does NOT read dbRound.needs_final_photo", () => {
    const src = readFile("src/pages/CrybabyActiveRound.tsx");
    // Strip JS line comments first so marker comments mentioning
    // "dbRound.needs_final_photo" as historical documentation don't
    // false-match. Block comments (/* ... */) and JSX comments
    // ({/* ... */}) are handled the same way: drop them, then assert
    // the residual code is photo-flag-free.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/^\s*\/\/.*$/gm, "");    // line comments
    // The flag-derivation regex from PR #27's tests: assert it stays absent.
    expect(stripped).not.toMatch(/needs_final_photo[\s\S]{0,40}===\s*true/);
    expect(stripped).not.toMatch(/const\s+needsFinalPhoto\s*=/);
    // No member-access read on dbRound.needs_final_photo in code.
    expect(stripped).not.toMatch(/dbRound\??\.needs_final_photo/);
  });

  it("RoundEditScores does NOT read needs_final_photo", () => {
    const src = readFile("src/pages/RoundEditScores.jsx");
    expect(src).not.toMatch(/needs_final_photo/);
    expect(src).not.toMatch(/needsFinalPhoto/);
  });

  it("RoundDetailPage does NOT read needs_final_photo", () => {
    const src = readFile("src/pages/RoundDetailPage.tsx");
    expect(src).not.toMatch(/needs_final_photo/);
    expect(src).not.toMatch(/needsFinalPhoto/);
  });
});
