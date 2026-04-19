import { describe, it, expect } from "vitest";
import { GAME_FORMATS } from "@/lib/gameFormats";
import type { GameMode } from "@/lib/gameEngines";

/**
 * Phase 2.5a: Wolf is hidden from the setup picker but remains a valid
 * game_type for legacy rounds. This test locks both sides of the invariant.
 */

describe("GAME_FORMATS — Wolf visibility", () => {
  it("Wolf IS a known format entry (legacy rounds still render metadata)", () => {
    const wolf = GAME_FORMATS.find(g => g.id === "wolf");
    expect(wolf).toBeDefined();
    expect(wolf?.name).toBe("Wolf");
  });

  it("Wolf is marked hidden so it's filtered out of the picker", () => {
    const wolf = GAME_FORMATS.find(g => g.id === "wolf");
    expect(wolf?.hidden).toBe(true);
  });

  it("no other currently-shipping mode is hidden", () => {
    // Visible set as of Phase 2.5: DOC, Flip, Nassau, Skins, Solo, Custom.
    // Wolf is the only exception. This test will fail deliberately if
    // a future change hides another mode without updating this assertion.
    const hidden = GAME_FORMATS.filter(g => g.hidden === true).map(g => g.id);
    expect(hidden).toEqual(["wolf"]);
  });

  it("visible picker set is non-empty and includes the core money modes", () => {
    const visible = GAME_FORMATS.filter(g => !g.hidden).map(g => g.id);
    expect(visible).toContain("drivers_others_carts");
    expect(visible).toContain("flip");
    expect(visible).toContain("nassau");
    expect(visible).toContain("skins");
    expect(visible).not.toContain("wolf");
  });
});

describe("GameMode type — Wolf is still valid", () => {
  it("type system still accepts 'wolf' as a GameMode literal", () => {
    // Compile-time assertion: this line fails typecheck if Wolf is
    // removed from GameMode.
    const mode: GameMode = "wolf";
    expect(mode).toBe("wolf");
  });
});
