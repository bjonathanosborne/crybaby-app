import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { GAME_FORMATS } from "@/lib/gameFormats";
import { getTeamsForHole, type Player } from "@/lib/gameEngines";

// ============================================================
// PR #30 commit 1.1 — DOC 4-player lock, defense-in-depth.
//
// Commit 1 fixed the engine's DOC team rotation and added an
// engine-layer guard (`resolveDOCRoster`) that throws on non-4-
// player rosters. This file adds the layers ABOVE the engine —
// the spec layer (gameFormats.ts entry) and the wizard layer
// (CrybabySetupWizard.jsx slot management + canProceed gate) —
// so a future widening of DOC's player-count config gets caught
// at multiple boundaries before it can produce broken rounds.
//
// Codebase pattern: wizard mount tests fight the supabase auth-
// init loop (see scorecardEditFlow.test.tsx for the rationale on
// avoiding heavy mounts here). Source-level regex assertions on
// the wizard source are the established alternative.
//
// Three layers covered:
//
//   1. Spec layer — GAME_FORMATS DOC entry has min === max === 4.
//      (gameFormats.ts is the single source of truth that the
//      wizard reads on format select.)
//
//   2. Wizard layer — the lock-when-min===max branch is present;
//      addPlayer is capped at format.players.max; canProceed
//      requires named.length >= format.players.min.
//
//   3. Engine layer — getDOCTeams throws on 3p / 5p / 6p input.
//      (Redundant with Commit 1's error-cases tests but locked in
//      here too with the explicit "DOC 4-player" framing for
//      bisect/grep ergonomics.)
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

// ------------------------------------------------------------
// Spec layer — GAME_FORMATS entry
// ------------------------------------------------------------

describe("DOC format spec — locked at exactly 4 players", () => {
  const docFormat = GAME_FORMATS.find(f => f.id === "drivers_others_carts");

  it("exists in GAME_FORMATS", () => {
    expect(docFormat, "DOC entry missing from GAME_FORMATS").toBeDefined();
  });

  it("has players: { min: 4, max: 4 } (no flexibility)", () => {
    expect(docFormat!.players).toEqual({ min: 4, max: 4 });
  });

  it("min === max === 4 (the wizard's lock-slots branch keys off this equality)", () => {
    // The setup wizard's auto-lock at line 907 of CrybabySetupWizard.jsx
    // is `if (format.players.min === format.players.max)`. If a future
    // refactor widens DOC to e.g. `{ min: 4, max: 6 }`, the wizard
    // stops auto-creating exactly 4 slots and starts allowing
    // dynamic adds — defeating the lock. This guard fails first.
    expect(docFormat!.players.min).toBe(docFormat!.players.max);
    expect(docFormat!.players.min).toBe(4);
  });
});

// ------------------------------------------------------------
// Wizard layer — slot management + canProceed gate
// ------------------------------------------------------------

describe("CrybabySetupWizard — DOC slot management (source-level)", () => {
  const wizardSrc = readFile("src/pages/CrybabySetupWizard.jsx");

  it("auto-locks the slot count when format.players.min === format.players.max", () => {
    // The lock branch must be present. Pre-PR-#30 it was line 907;
    // future refactors can move it but the conditional must stay.
    expect(wizardSrc).toMatch(
      /if\s*\(\s*format\.players\.min\s*===\s*format\.players\.max\s*\)/,
    );
  });

  it("auto-fills slot array of length format.players.min on lock", () => {
    // The companion `Array.from({ length: format.players.min }, ...)`
    // — sets the slot count to exactly the locked size when the
    // format is selected.
    expect(wizardSrc).toMatch(/Array\.from\(\{\s*length:\s*format\.players\.min\s*\}/);
  });

  it("addPlayer respects format.players.max (no 5th slot for DOC)", () => {
    // Defensive cap — even if the lock branch above broke, the add
    // path still wouldn't allow exceeding max.
    expect(wizardSrc).toMatch(/format\?\.players\.max\s*\|\|\s*\d+/);
    // Sanity: the addPlayer guard is `if (players.length < maxP)`
    // (i.e. only adds when below max), so 4-slot DOC can never get
    // a 5th from this path.
    expect(wizardSrc).toMatch(/if\s*\(\s*players\.length\s*<\s*maxP\s*\)/);
  });

  it("canProceed for the players step requires named.length >= format.players.min", () => {
    // The Continue button gate: minimum-player check at line ~972
    // of the wizard. For DOC this evaluates to "need 4 named
    // players to proceed."
    expect(wizardSrc).toMatch(
      /named\.length\s*<\s*\(\s*format\?\.players\.min/,
    );
  });

  it("DOC players step also requires every player to have cart + position assigned", () => {
    // Pre-PR-#23 audit found this guard at lines ~977-983 of
    // CrybabySetupWizard.jsx. It blocks round creation when any
    // named player is missing cart or position — second line of
    // defense ensuring the engine never sees malformed input. The
    // gate is `format?.requiresCarts` (DOC sets this to true in
    // gameFormats.ts; no other format does today).
    expect(wizardSrc).toMatch(
      /if\s*\(\s*format\?\.requiresCarts\s*\)[\s\S]{0,300}p\.cart\s*===\s*["']A["']\s*\|\|\s*p\.cart\s*===\s*["']B["']/,
    );
    expect(wizardSrc).toMatch(
      /p\.position\s*===\s*["']driver["']\s*\|\|\s*p\.position\s*===\s*["']rider["']/,
    );
  });

  it("DOC's GAME_FORMATS entry sets requiresCarts: true (the gate this guard keys off)", () => {
    // The wizard's cart/position guard runs only when
    // format.requiresCarts is true. If a future refactor flips
    // DOC to requiresCarts: false, the guard becomes dead and
    // the engine sees malformed cart/position input. Lock that
    // down here.
    const docFormat = GAME_FORMATS.find(f => f.id === "drivers_others_carts");
    expect(docFormat!.requiresCarts).toBe(true);
  });
});

// ------------------------------------------------------------
// Engine layer — getDOCTeams throws on non-4-player input
// ------------------------------------------------------------

describe("DOC engine guard — throws on non-4-player rosters (3p / 5p / 6p)", () => {
  function makePlayer(id: string, cart: "A" | "B", position: "driver" | "rider"): Player {
    return { id, name: id, handicap: 10, cart, position, color: "#000" };
  }

  function makeNDOC(n: 3 | 4 | 5 | 6): Player[] {
    // Build N players with cart/position cycling so the roster is
    // structurally plausible (i.e. has both carts and both positions).
    // The engine should still throw on n !== 4 because of the count
    // guard, BEFORE the slot-resolver runs.
    const slots: Array<["A" | "B", "driver" | "rider"]> = [
      ["A", "driver"], ["A", "rider"], ["B", "driver"], ["B", "rider"],
      ["A", "driver"], ["A", "rider"],
    ];
    return Array.from({ length: n }, (_, i) =>
      makePlayer(`p${i + 1}`, slots[i][0], slots[i][1]),
    );
  }

  it("throws on a 3-player DOC roster with the canonical error message", () => {
    expect(() => getTeamsForHole("drivers_others_carts", 6, makeNDOC(3))).toThrow(
      /DOC requires exactly 4 players \(got 3\)/,
    );
  });

  it("throws on a 5-player DOC roster with the canonical error message", () => {
    expect(() => getTeamsForHole("drivers_others_carts", 6, makeNDOC(5))).toThrow(
      /DOC requires exactly 4 players \(got 5\)/,
    );
  });

  it("throws on a 6-player DOC roster with the canonical error message", () => {
    expect(() => getTeamsForHole("drivers_others_carts", 6, makeNDOC(6))).toThrow(
      /DOC requires exactly 4 players \(got 6\)/,
    );
  });

  it("the error message mentions the product decision (no 5p generalization)", () => {
    // The error string captures WHY the engine refuses to guess:
    // "5-player DOC was never a product-supported configuration".
    // This stays as a runtime breadcrumb so future engineers
    // reading a stack trace know it's not a missing feature.
    try {
      getTeamsForHole("drivers_others_carts", 6, makeNDOC(5));
      throw new Error("expected getTeamsForHole to throw");
    } catch (e) {
      expect((e as Error).message).toMatch(/never a product-supported configuration/);
    }
  });

  it("Crybaby holes (16-18) bypass the count guard — engine returns null even on bad rosters", () => {
    // The team-rotation function is bypassed for Crybaby holes
    // (caller branches to skins logic). Locked in here so a future
    // refactor doesn't accidentally validate the roster before the
    // early-null return — would break replay fidelity for any
    // legacy round that somehow had a non-4-player roster on
    // those holes.
    expect(getTeamsForHole("drivers_others_carts", 16, makeNDOC(3))).toBeNull();
    expect(getTeamsForHole("drivers_others_carts", 17, makeNDOC(5))).toBeNull();
    expect(getTeamsForHole("drivers_others_carts", 18, makeNDOC(6))).toBeNull();
  });
});
