import { describe, it, expect } from "vitest";
import { GAME_FORMATS } from "@/lib/gameFormats";
import type { GameMode } from "@/lib/gameEngines";

/**
 * Testing-surface invariants for the setup wizard's visible game list.
 *
 * Phase 2.5a hid Wolf. The DOC-focused testing pass (this branch) also
 * hides Nassau, Skins, Flip, and Custom so on-course validation focuses
 * on one game that exercises every mechanic in the stack.
 *
 * Legacy rounds in hidden modes must still load + replay — the test
 * suite for the engine (`gameEngines.test.ts`) + `replayEquivalence`
 * cover money math for those modes; this file just locks in the
 * visibility flags.
 */

describe("GAME_FORMATS — visible set (DOC-focused testing surface)", () => {
  it("only DOC and Solo are visible in the setup picker", () => {
    const visible = GAME_FORMATS.filter(g => !g.hidden).map(g => g.id).sort();
    expect(visible).toEqual(["drivers_others_carts", "solo"]);
  });

  it("every other mode exists in the list with hidden: true", () => {
    const hidden = GAME_FORMATS.filter(g => g.hidden === true).map(g => g.id).sort();
    expect(hidden).toEqual(["custom", "flip", "nassau", "skins", "wolf"]);
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

  it("Nassau/Skins/Flip/Custom all exist with full names", () => {
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
