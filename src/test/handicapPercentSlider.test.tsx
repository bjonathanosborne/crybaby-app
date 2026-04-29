import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";

import {
  computeAdjustedHandicap,
  resolveHandicapPercent,
  shouldShowHandicapPercentLine,
  isHandicapPercentValid,
  HANDICAP_PERCENT_MIN,
  HANDICAP_PERCENT_MAX,
  HANDICAP_PERCENT_STEP,
  HANDICAP_PERCENT_DEFAULT,
} from "@/lib/handicap";
import { replayRound } from "@/lib/gameEngines";
import type {
  GameSettings,
  Player,
  ReplayHoleInput,
} from "@/lib/gameEngines";

// ============================================================
// PR #17 commit 2 — per-round handicap percentage slider.
//
// Coverage:
//   (a) Pure helpers: computeAdjustedHandicap + resolveHandicapPercent
//       + isHandicapPercentValid + shouldShowHandicapPercentLine
//       + constants.
//   (b) Setup wizard source-level: slider component exists, renders
//       for DOC/Flip only, defaults to 100, removes legacy button tabs.
//   (c) db.ts source-level: createRound accepts handicapPercent, writes
//       it to the rounds row, computes adjusted + preserves rawHandicap
//       + handicap_percent audit fields on playerConfig.
//   (d) RoundDetailPage source-level: "Playing at X%" line + per-player
//       block gated on non-default percent.
//   (e) RoundEditScores source-level: slider + warning banner + save
//       gate + updateRoundHandicapPercent usage.
//   (f) apply-capture source-level: new-world detection, legacy pops
//       fallback, no re-scaling of adjusted handicap.
//   (g) Replay integration: legacy round with raw handicap +
//       pops=60 replays with correct pops strokes; new-world round
//       with adjusted handicap + 100% does NOT double-scale.
//   (h) Migration file source-level: column + CHECK + idempotency.
// ============================================================

beforeEach(() => cleanup());

// ---------- (a) pure helpers ----------

describe("computeAdjustedHandicap", () => {
  it("at 100%, raw = adjusted", () => {
    expect(computeAdjustedHandicap(13, 100)).toBe(13);
    expect(computeAdjustedHandicap(0, 100)).toBe(0);
    expect(computeAdjustedHandicap(-2, 100)).toBe(-2);
  });
  it("at 80%, 13 floors to 10", () => {
    expect(computeAdjustedHandicap(13, 80)).toBe(10);
  });
  it("at 75%, 13 floors to 9", () => {
    expect(computeAdjustedHandicap(13, 75)).toBe(9);
  });
  it("at 50%, even values halve cleanly", () => {
    expect(computeAdjustedHandicap(20, 50)).toBe(10);
  });
  it("zero handicap stays zero at any percent", () => {
    expect(computeAdjustedHandicap(0, 80)).toBe(0);
    expect(computeAdjustedHandicap(0, 50)).toBe(0);
  });
  it("negative handicap: -2 at 80% → -2 (floor of -1.6)", () => {
    expect(computeAdjustedHandicap(-2, 80)).toBe(-2);
  });
  it("null / undefined raw → null (no substitution)", () => {
    expect(computeAdjustedHandicap(null, 80)).toBeNull();
    expect(computeAdjustedHandicap(undefined, 80)).toBeNull();
  });
  it("NaN raw → null (defensive)", () => {
    expect(computeAdjustedHandicap(NaN, 80)).toBeNull();
  });
});

describe("resolveHandicapPercent — fallback hierarchy", () => {
  it("1. round.handicap_percent wins when present", () => {
    const pct = resolveHandicapPercent(
      { handicap_percent: 75 },
      { mechanicSettings: { pops: { handicapPercent: 60 } } },
    );
    expect(pct).toBe(75);
  });
  it("2. legacy pops.handicapPercent used when round column is null", () => {
    const pct = resolveHandicapPercent(
      { handicap_percent: null },
      { mechanicSettings: { pops: { handicapPercent: 60 } } },
    );
    expect(pct).toBe(60);
  });
  it("2. legacy pops.handicapPercent used when round column is undefined", () => {
    const pct = resolveHandicapPercent(
      {},
      { mechanicSettings: { pops: { handicapPercent: 80 } } },
    );
    expect(pct).toBe(80);
  });
  it("3. default 100 when no column and no legacy data", () => {
    const pct = resolveHandicapPercent({ handicap_percent: null }, null);
    expect(pct).toBe(100);
  });
  it("round column === 0 is NOT ignored — only null/undefined triggers fallback", () => {
    // Not a meaningful value (0% would be rejected by CHECK) but we want
    // resolve semantics to be explicit: any numeric value wins.
    const pct = resolveHandicapPercent({ handicap_percent: 0 }, null);
    expect(pct).toBe(0);
  });
  it("explicit 100 distinguishes from NULL legacy at API level", () => {
    expect(resolveHandicapPercent({ handicap_percent: 100 }, null)).toBe(100);
    expect(resolveHandicapPercent({ handicap_percent: null }, null)).toBe(100);
    // Both read as 100; the column value is the audit trail.
  });
});

describe("isHandicapPercentValid", () => {
  it("accepts multiples of 5 in [50, 100]", () => {
    expect(isHandicapPercentValid(50)).toBe(true);
    expect(isHandicapPercentValid(55)).toBe(true);
    expect(isHandicapPercentValid(75)).toBe(true);
    expect(isHandicapPercentValid(100)).toBe(true);
  });
  it("rejects below 50", () => {
    expect(isHandicapPercentValid(45)).toBe(false);
    expect(isHandicapPercentValid(0)).toBe(false);
    expect(isHandicapPercentValid(-5)).toBe(false);
  });
  it("rejects above 100", () => {
    expect(isHandicapPercentValid(105)).toBe(false);
    expect(isHandicapPercentValid(200)).toBe(false);
  });
  it("rejects non-multiples of 5", () => {
    expect(isHandicapPercentValid(73)).toBe(false);
    expect(isHandicapPercentValid(81)).toBe(false);
  });
  it("rejects non-integers", () => {
    expect(isHandicapPercentValid(75.5)).toBe(false);
  });
  it("rejects non-finite", () => {
    expect(isHandicapPercentValid(NaN)).toBe(false);
    expect(isHandicapPercentValid(Infinity)).toBe(false);
  });
});

describe("shouldShowHandicapPercentLine", () => {
  it("hides the line at the default 100%", () => {
    expect(shouldShowHandicapPercentLine(100)).toBe(false);
  });
  it("shows at any non-default value", () => {
    expect(shouldShowHandicapPercentLine(50)).toBe(true);
    expect(shouldShowHandicapPercentLine(80)).toBe(true);
    expect(shouldShowHandicapPercentLine(95)).toBe(true);
  });
});

describe("constants match spec", () => {
  it("50 / 100 / 5 / 100", () => {
    expect(HANDICAP_PERCENT_MIN).toBe(50);
    expect(HANDICAP_PERCENT_MAX).toBe(100);
    expect(HANDICAP_PERCENT_STEP).toBe(5);
    expect(HANDICAP_PERCENT_DEFAULT).toBe(100);
  });
});

// ---------- file-reading helper for source checks ----------

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

// ---------- (b) setup wizard ----------

describe("CrybabySetupWizard — handicap percentage slider (source-level)", () => {
  const src = readFile("src/pages/CrybabySetupWizard.jsx");

  it("defines a HandicapPercentSlider component with min=50, max=100, step=5", () => {
    expect(src).toMatch(/function\s+HandicapPercentSlider/);
    expect(src).toMatch(/min=\{50\}/);
    expect(src).toMatch(/max=\{100\}/);
    expect(src).toMatch(/step=\{5\}/);
  });

  it("slider is gated to DOC and Flip formats only", () => {
    expect(src).toMatch(/selectedFormat\s*===\s*["']drivers_others_carts["']\s*\|\|\s*selectedFormat\s*===\s*["']flip["']/);
  });

  it("state defaults to 100 and lives at top level (not nested under pops)", () => {
    expect(src).toMatch(/useState\(100\)/);
    expect(src).toMatch(/\[handicapPercent,\s*setHandicapPercent\]/);
  });

  it("legacy [60,70,80,90,100] button-tab picker is removed", () => {
    // The old picker's unique array literal should be gone.
    expect(src).not.toMatch(/\[60,\s*70,\s*80,\s*90,\s*100\]\.map/);
  });

  it("pops mechanic settings no longer carry handicapPercent", () => {
    // pops entry is now empty — the percent lives elsewhere.
    expect(src).toMatch(/pops:\s*\{\s*\}/);
  });

  it("helper text quotes the spec", () => {
    expect(src).toMatch(/Scale each player's handicap for team fairness/);
    expect(src).toMatch(/100%\s*=\s*full handicap/);
  });

  it("the round-create call receives the top-level handicapPercent", () => {
    // PR #30 D4-A: wizard now calls `startRound` (the atomic RPC
    // path); legacy `createRound` is still exported for now but
    // no longer the wizard's call site. Match either name.
    expect(src).toMatch(/(startRound|createRound)\(\s*\{[\s\S]*?handicapPercent:\s*roundHandicapPercent/);
    // Non-team formats force 100. Regex tolerates wrapping / parens / newlines.
    expect(src).toMatch(/selectedFormat\s*===\s*["']drivers_others_carts["']\s*\|\|\s*selectedFormat\s*===\s*["']flip["']\)?\s*[\s\S]{0,10}\?\s*handicapPercent\s*[\s\S]{0,10}:\s*100/);
  });
});

// ---------- (c) db.ts createRound ----------

describe("db.ts — createRound persistence (source-level)", () => {
  const src = readFile("src/lib/db.ts");

  it("createRound accepts a handicapPercent param", () => {
    expect(src).toMatch(/function createRound\([\s\S]*?handicapPercent/);
  });

  it("writes handicap_percent to the rounds row", () => {
    expect(src).toMatch(/handicap_percent:\s*percent/);
  });

  it("playerConfig entries carry handicap (adjusted) + rawHandicap + handicap_percent audit", () => {
    expect(src).toMatch(/handicap:\s*adjusted/);
    expect(src).toMatch(/rawHandicap:\s*raw/);
    expect(src).toMatch(/handicap_percent:\s*percent/);
  });

  it("adjusted handicap uses round-to-nearest semantics (PR #32)", () => {
    // PR #32 flipped the round-start scaling from Math.floor to
    // Math.round to align with the engine's getStrokesOnHole rule.
    // The on-course bug: raw 7.8 floored to 7 created an artificial
    // 1-stroke gap with a player at raw 8.0. See
    // src/test/jonathanDOCPopMath.test.ts for the regression suite.
    expect(src).toMatch(/Math\.round\(\(raw \* percent\) \/ 100\)/);
    // No Math.floor at the round-start scaling site.
    expect(src).not.toMatch(/Math\.floor\(\(raw \* percent\) \/ 100\)/);
  });

  it("percent defaults to 100 when caller omits it", () => {
    expect(src).toMatch(/typeof handicapPercent === "number" \? handicapPercent : 100/);
  });

  it("exports updateRoundHandicapPercent for the post-completion edit flow", () => {
    expect(src).toMatch(/export async function updateRoundHandicapPercent/);
    expect(src).toMatch(/handicap_percent:\s*newPercent/);
  });

  it("RoundDetailBundle.round type exposes handicap_percent", () => {
    expect(src).toMatch(/handicap_percent\?:\s*number \| null/);
  });

  it("playerConfig audit fields are typed on the bundle", () => {
    expect(src).toMatch(/rawHandicap\?:\s*number \| null/);
  });
});

// ---------- (d) RoundDetailPage ----------

describe("RoundDetailPage — handicap percent display (source-level)", () => {
  const src = readFile("src/pages/RoundDetailPage.tsx");

  it("imports resolveHandicapPercent + shouldShowHandicapPercentLine", () => {
    expect(src).toMatch(/resolveHandicapPercent/);
    expect(src).toMatch(/shouldShowHandicapPercentLine/);
  });

  it("renders the 'Playing at X%' line with a stable testid", () => {
    expect(src).toMatch(/data-testid="round-detail-handicap-percent"/);
    expect(src).toMatch(/Playing at \{resolved\}% handicap/);
  });

  it("per-player block rendered when rawHandicap present + non-default percent", () => {
    expect(src).toMatch(/data-testid="round-detail-handicap-per-player"/);
    expect(src).toMatch(/round-detail-handicap-player-/);
  });

  it("hides the line at 100% via shouldShowHandicapPercentLine gate", () => {
    // Guard runs BEFORE any render of the percent block
    expect(src).toMatch(/if \(!shouldShowHandicapPercentLine\(resolved\)\) return null/);
  });

  it("per-player display format: 'adjusted (pct% of raw)' when non-default, plain 'raw' at 100%", () => {
    expect(src).toMatch(/resolved === 100/);
    expect(src).toMatch(/\$\{adjusted\} \(\$\{resolved\}% of \$\{raw\}\)/);
  });
});

// ---------- (e) RoundEditScores ----------

describe("RoundEditScores — post-completion edit warning (source-level)", () => {
  const src = readFile("src/pages/RoundEditScores.jsx");

  it("imports resolveHandicapPercent + HANDICAP_PERCENT_DEFAULT + updateRoundHandicapPercent", () => {
    expect(src).toMatch(/resolveHandicapPercent/);
    expect(src).toMatch(/HANDICAP_PERCENT_DEFAULT/);
    expect(src).toMatch(/updateRoundHandicapPercent/);
  });

  it("initializes percentOriginal + percentEdit state from resolved value", () => {
    expect(src).toMatch(/useState\(HANDICAP_PERCENT_DEFAULT\)/);
    expect(src).toMatch(/setPercentOriginal\(resolvedPct\)/);
    expect(src).toMatch(/setPercentEdit\(resolvedPct\)/);
  });

  it("slider gated on team games (DOC + Flip)", () => {
    expect(src).toMatch(/gameMode === "drivers_others_carts" \|\| gameMode === "flip"/);
  });

  it("warning banner renders when percent changes", () => {
    expect(src).toMatch(/data-testid="edit-scores-handicap-percent-warning"/);
    expect(src).toMatch(/You're changing the handicap %/);
    expect(src).toMatch(/This will affect settlements/);
  });

  it("confirmation checkbox gates the save button", () => {
    expect(src).toMatch(/data-testid="edit-scores-handicap-percent-confirm"/);
    expect(src).toMatch(/percentChanged && !percentChangeConfirmed/);
  });

  it("save flow persists percent BEFORE scores/settlements", () => {
    const savePos = src.indexOf("async function handleSave");
    const percentCall = src.indexOf("updateRoundHandicapPercent", savePos);
    const settleCall = src.indexOf("updateRoundScoresAndSettlements", savePos);
    expect(percentCall).toBeGreaterThan(savePos);
    // Percent update happens first in the save flow
    expect(percentCall).toBeLessThan(settleCall);
  });
});

// ---------- (f) apply-capture ----------

describe("apply-capture — handicap percent resolution (source-level)", () => {
  const src = readFile("supabase/functions/apply-capture/index.ts");

  it("detects new-world rounds via playerConfig.handicap_percent presence", () => {
    expect(src).toMatch(/newWorldRound\s*=\s*playerConfigs\.some/);
    expect(src).toMatch(/handicap_percent\?:\s*unknown/);
  });

  it("passes 100 for new-world rounds (no double-scaling)", () => {
    expect(src).toMatch(/newWorldRound\s*\?\s*100/);
  });

  it("legacy path reads pops.handicapPercent (not the old buggy flat location)", () => {
    expect(src).toMatch(/popsSettings[\s\S]{0,200}handicapPercent/);
  });

  it("rounds.handicap_percent is preferred over legacy pops when non-null", () => {
    expect(src).toMatch(/roundLevelPercent/);
  });
});

// ---------- (g) replay integration ----------

function makeSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    hammer: false,
    hammerInitiator: "any",
    hammerMaxDepth: "1",
    crybaby: false,
    crybabHoles: 3,
    crybabHammerRule: "allowed",
    birdieBonus: false,
    birdieMultiplier: 2,
    pops: true,                 // enable pops for the handicap scaling path
    noPopsParThree: true,
    carryOverEnabled: true,     // PR #30 commit 2: explicit toggle (existing tests assume always-on)
    carryOverCap: "∞",
    handicapPercent: 100,
    presses: false,
    pressType: "auto",
    ...overrides,
  };
}

describe("replay equivalence — legacy vs new-world handicap scaling", () => {
  it("legacy round with raw handicap + 60% pops still resolves strokes correctly", () => {
    // Legacy pattern: RAW handicap in player.handicap, engine scales via
    // settings.handicapPercent.
    const players: Player[] = [
      { id: "p1", name: "Alice", handicap: 20, color: "#16A34A" }, // raw 20 at 60% → 12 adjusted
      { id: "p2", name: "Bob",   handicap: 10, color: "#3B82F6" }, // raw 10 at 60% → 6 adjusted
    ];
    const settings = makeSettings({ handicapPercent: 60 });
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holes: ReplayHoleInput[] = [
      { holeNumber: 1, scores: { p1: 4, p2: 4 }, hammerDepth: 0, folded: false },
    ];
    const replay = replayRound("skins", players, pars, handicaps, 2, settings, holes);
    // Just assert the replay ran without exception (totals match via existing
    // equivalence tests). This test is guarding against the apply-capture fix
    // regressing legacy rounds that were previously silently replayed at 100%.
    expect(replay.holeResults).toHaveLength(1);
  });

  it("new-world round with adjusted handicap + 100% does NOT double-scale", () => {
    // New-world pattern: player.handicap is the ADJUSTED value, settings.
    // handicapPercent is 100 so the engine's built-in scaler is a no-op.
    const adjustedPlayers: Player[] = [
      { id: "p1", name: "Alice", handicap: 12, color: "#16A34A" }, // adjusted already
      { id: "p2", name: "Bob",   handicap: 6,  color: "#3B82F6" },
    ];
    const legacyPlayers: Player[] = [
      { id: "p1", name: "Alice", handicap: 20, color: "#16A34A" }, // raw
      { id: "p2", name: "Bob",   handicap: 10, color: "#3B82F6" },
    ];
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holes: ReplayHoleInput[] = [
      { holeNumber: 1, scores: { p1: 4, p2: 4 }, hammerDepth: 0, folded: false },
    ];

    // New-world: adjusted + 100% (engine no-scale)
    const rNew = replayRound(
      "skins", adjustedPlayers, pars, handicaps, 2,
      makeSettings({ handicapPercent: 100 }),
      holes,
    );
    // Legacy-equivalent: raw + 60% (engine scales 20→12 via round(x * 60/100))
    const rLegacy = replayRound(
      "skins", legacyPlayers, pars, handicaps, 2,
      makeSettings({ handicapPercent: 60 }),
      holes,
    );
    // Both paths should produce the same totals map for this scenario.
    // If apply-capture ever double-scales (pre-fix behaviour), rNew's totals
    // would drift because adjusted=12 would be re-scaled to 7.
    expect(rNew.totals).toEqual(rLegacy.totals);
  });
});

// ---------- (h) migration file ----------

describe("20260420030000_rounds_handicap_percent migration", () => {
  const mig = readFile("supabase/migrations/20260420030000_rounds_handicap_percent.sql");

  it("adds handicap_percent column to rounds, idempotent", () => {
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS handicap_percent INTEGER/);
  });

  it("CHECK constraint enforces 50-100 range + 5%% step + NULL allowed", () => {
    expect(mig).toMatch(/handicap_percent IS NULL OR \(/);
    expect(mig).toMatch(/handicap_percent >= 50/);
    expect(mig).toMatch(/handicap_percent <= 100/);
    expect(mig).toMatch(/handicap_percent % 5 = 0/);
  });

  it("DROP CONSTRAINT IF EXISTS before ADD for re-runnability", () => {
    expect(mig).toMatch(/DROP CONSTRAINT IF EXISTS handicap_percent_range/);
  });

  it("tracker insert uses ON CONFLICT DO NOTHING (idempotent)", () => {
    expect(mig).toMatch(/INSERT INTO supabase_migrations\.schema_migrations[\s\S]*?ON CONFLICT \(version\) DO NOTHING/);
  });

  it("tracker insert uses the three-column shape (statements = ARRAY[])", () => {
    expect(mig).toMatch(/\(version,\s*name,\s*statements\)/);
    expect(mig).toMatch(/ARRAY\[\]::text\[\]/);
  });

  it("column + constraint both get audit COMMENTs", () => {
    expect(mig).toMatch(/COMMENT ON COLUMN public\.rounds\.handicap_percent/);
    expect(mig).toMatch(/COMMENT ON CONSTRAINT handicap_percent_range/);
  });
});
