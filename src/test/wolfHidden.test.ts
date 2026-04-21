import { describe, it, expect } from "vitest";
import { GAME_FORMATS } from "@/lib/gameFormats";
import type { GameMode } from "@/lib/gameEngines";

/**
 * Testing-surface invariants for the setup wizard's visible game list.
 *
 * Phase 2.5a hid Wolf. The DOC-focused testing pass (this branch) also
 * hid Nassau, Skins, Flip, and Custom so on-course validation could
 * focus on one mode exercising every mechanic.
 *
 * Un-hide / hide history:
 *   - Flip      — un-hidden 2026-04-20 via PR #16 (5-man 3v2 + crybaby).
 *   - Skins     — un-hidden 2026-04-21 via PR #17 commit 3.
 *   - Scorecard — added + visible 2026-04-21 via PR #19 (no-money mode).
 *   - Solo      — HIDDEN 2026-04-21 via PR #21. Scorecard at 1 player
 *                 is a strict superset of Solo's capabilities; Solo's
 *                 /solo route + SoloRound.jsx stay in the tree so
 *                 legacy Solo rounds continue to render and any
 *                 future un-hide is a one-line flag flip.
 *
 * Legacy rounds in still-hidden modes (Solo, Nassau, Wolf, Custom)
 * must continue to load + replay — the engine suite + replayEquivalence
 * cover money math for those; this file locks visibility flags.
 */

describe("GAME_FORMATS — visible set (DOC + Flip + Scorecard + Skins, 2026-04-21)", () => {
  it("DOC, Flip, Scorecard, and Skins are visible in the setup picker", () => {
    const visible = GAME_FORMATS.filter(g => !g.hidden).map(g => g.id).sort();
    // Solo hidden in PR #21 — scorecard-at-1-player supersedes it.
    expect(visible).toEqual(["drivers_others_carts", "flip", "scorecard", "skins"]);
  });

  it("Solo, Nassau, Wolf, and Custom remain hidden", () => {
    const hidden = GAME_FORMATS.filter(g => g.hidden === true).map(g => g.id).sort();
    expect(hidden).toEqual(["custom", "nassau", "solo", "wolf"]);
  });

  it("Solo entry still present in the registry (metadata for legacy rounds)", () => {
    const solo = GAME_FORMATS.find(g => g.id === "solo");
    expect(solo).toBeDefined();
    expect(solo?.hidden).toBe(true);
    // Legacy rounds use this to render the "Just Me" label on round
    // cards; don't rename or remove.
    expect(solo?.name).toBe("Just Me");
  });

  it("Skins is visible with the un-hide-era description copy", () => {
    const skins = GAME_FORMATS.find(g => g.id === "skins");
    expect(skins?.hidden).toBe(false);
    expect(skins?.players).toEqual({ min: 2, max: 6 });
    expect(skins?.description).toMatch(/Per-hole competition/);
    expect(skins?.description).toMatch(/2.?6 players/);
  });

  it("GAME_FORMATS is the single source of truth — no duplicate ids", () => {
    const ids = GAME_FORMATS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("GAME_FORMATS — hidden modes keep full metadata for legacy renders", () => {
  it("each hidden mode still has name, description, mechanics, players range", () => {
    const hidden = GAME_FORMATS.filter(g => g.hidden === true);
    for (const g of hidden) {
      expect(g.name).toBeTruthy();
      expect(g.description).toBeTruthy();
      expect(Array.isArray(g.mechanics)).toBe(true);
      expect(g.players.min).toBeGreaterThan(0);
      expect(g.players.max).toBeGreaterThanOrEqual(g.players.min);
    }
  });

  it("Wolf is still a known format entry (legacy rounds render metadata)", () => {
    const wolf = GAME_FORMATS.find(g => g.id === "wolf");
    expect(wolf).toBeDefined();
    expect(wolf?.name).toBe("Wolf");
    expect(wolf?.hidden).toBe(true);
  });

  it("Nassau/Skins/Flip/Custom all exist with full names (visibility aside)", () => {
    const nassau = GAME_FORMATS.find(g => g.id === "nassau");
    const skins = GAME_FORMATS.find(g => g.id === "skins");
    const flip = GAME_FORMATS.find(g => g.id === "flip");
    const custom = GAME_FORMATS.find(g => g.id === "custom");
    expect(nassau?.name).toBe("Nassau");
    expect(skins?.name).toBe("Skins");
    expect(flip?.name).toBe("Flip");
    expect(custom?.name).toBe("Custom Game");
  });
});

describe("GameMode type — hidden modes are still valid literals", () => {
  it("every hidden id is a valid GameMode type literal (compile-time check)", () => {
    // These assignments fail typecheck if any id is removed from the
    // GameMode union in gameEngines.ts. Acts as a regression guard: if
    // someone hides a mode by DELETING it from the type, this breaks.
    const wolf: GameMode = "wolf";
    const nassau: GameMode = "nassau";
    const skins: GameMode = "skins";
    const flip: GameMode = "flip";
    const custom: GameMode = "custom";
    expect(wolf).toBe("wolf");
    expect(nassau).toBe("nassau");
    expect(skins).toBe("skins");
    expect(flip).toBe("flip");
    expect(custom).toBe("custom");
    // 'solo' is a GameFormatId but NOT a GameMode — it's its own route
    // (SoloRound) outside the engine's money-math world. Not asserted
    // here because that'd be a type error on purpose.
  });
});
