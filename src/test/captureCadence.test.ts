import { describe, it, expect } from "vitest";
import {
  requiredCadence,
  isPhotoRequiredForHole,
  cadenceReason,
  type CadenceRoundInput,
  type CaptureCadence,
} from "@/lib/captureCadence";

/**
 * Cadence is the photo-schedule contract between the game engine and
 * the capture UI. These tests lock it in. The discriminated-union
 * return type means the switch in isPhotoRequiredForHole is
 * exhaustive at compile time; these tests verify the runtime rules.
 */

const R = (gameType: string, mechanics: string[] = []): CadenceRoundInput => ({
  gameType,
  mechanics,
});

// Exhaustiveness pattern: a function that takes CaptureCadence and must
// handle every case. If we ever add a new variant, TS will complain here.
function cadenceLabel(c: CaptureCadence): string {
  switch (c.type) {
    case "every_hole": return "every_hole";
    case "holes": return `holes:[${c.holes.join(",")}]`;
    case "none": return "none";
  }
}

describe("requiredCadence — game-mode defaults (no mechanics)", () => {
  it("solo / just_me: no photos required", () => {
    expect(requiredCadence(R("solo")).type).toBe("none");
    expect(requiredCadence(R("just_me")).type).toBe("none");
  });

  it("nassau without presses: photos at turn (9) and finish (18)", () => {
    const c = requiredCadence(R("nassau"));
    expect(c).toEqual({ type: "holes", holes: [9, 18] });
  });

  it("skins: every hole (implicit carry-over)", () => {
    expect(requiredCadence(R("skins")).type).toBe("every_hole");
  });

  it("drivers_others_carts: every hole (safe default for team modes)", () => {
    expect(requiredCadence(R("drivers_others_carts")).type).toBe("every_hole");
  });

  it("flip: every hole", () => {
    expect(requiredCadence(R("flip")).type).toBe("every_hole");
  });

  it("wolf: every hole (rotation depends on prior results)", () => {
    expect(requiredCadence(R("wolf")).type).toBe("every_hole");
  });

  it("custom: every hole (conservative default)", () => {
    expect(requiredCadence(R("custom")).type).toBe("every_hole");
  });
});

describe("requiredCadence — mechanics upgrade nassau to every_hole", () => {
  it("nassau + presses → every_hole (press timing is score-dependent)", () => {
    expect(requiredCadence(R("nassau", ["presses"])).type).toBe("every_hole");
  });

  it("nassau + hammer → every_hole", () => {
    // Mechanically unusual but test the rule is consistent
    expect(requiredCadence(R("nassau", ["hammer"])).type).toBe("every_hole");
  });

  it("nassau + birdie_bonus → every_hole", () => {
    expect(requiredCadence(R("nassau", ["birdie_bonus"])).type).toBe("every_hole");
  });

  it("nassau + crybaby → every_hole", () => {
    expect(requiredCadence(R("nassau", ["crybaby"])).type).toBe("every_hole");
  });

  it("nassau + carry_over → every_hole", () => {
    expect(requiredCadence(R("nassau", ["carry_over"])).type).toBe("every_hole");
  });
});

describe("requiredCadence — mechanics don't downgrade every_hole modes", () => {
  it("DOC + hammer + crybaby + birdie_bonus + pops: every_hole", () => {
    expect(
      requiredCadence(R("drivers_others_carts", ["hammer", "crybaby", "birdie_bonus", "pops"])).type,
    ).toBe("every_hole");
  });

  it("skins + carry_over: every_hole", () => {
    expect(requiredCadence(R("skins", ["carry_over"])).type).toBe("every_hole");
  });
});

describe("isPhotoRequiredForHole — per-hole resolution", () => {
  it("every_hole: true for holes 1..18, false for out-of-range", () => {
    const r = R("skins");
    for (let h = 1; h <= 18; h++) expect(isPhotoRequiredForHole(r, h)).toBe(true);
    expect(isPhotoRequiredForHole(r, 0)).toBe(false);
    expect(isPhotoRequiredForHole(r, 19)).toBe(false);
  });

  it("nassau no-presses: true at 9 and 18, false elsewhere", () => {
    const r = R("nassau");
    expect(isPhotoRequiredForHole(r, 1)).toBe(false);
    expect(isPhotoRequiredForHole(r, 8)).toBe(false);
    expect(isPhotoRequiredForHole(r, 9)).toBe(true);
    expect(isPhotoRequiredForHole(r, 10)).toBe(false);
    expect(isPhotoRequiredForHole(r, 17)).toBe(false);
    expect(isPhotoRequiredForHole(r, 18)).toBe(true);
  });

  it("solo: false for every hole", () => {
    const r = R("solo");
    for (let h = 1; h <= 18; h++) expect(isPhotoRequiredForHole(r, h)).toBe(false);
  });
});

describe("cadenceReason — copy selection", () => {
  it("returns null when no photo is required", () => {
    expect(cadenceReason(R("solo"), 5)).toBeNull();
    expect(cadenceReason(R("nassau"), 5)).toBeNull();
  });

  it("hammer takes precedence over other mechanics and mentions the prompt", () => {
    const reason = cadenceReason(R("drivers_others_carts", ["hammer", "crybaby", "birdie_bonus"]), 5);
    expect(reason).toMatch(/Hammer/);
    // Phase 2.5 wording: copy must reference the hammer prompt flow.
    expect(reason).toMatch(/hammer prompt/i);
  });

  it("nassau turn and finish use segment copy", () => {
    expect(cadenceReason(R("nassau"), 9)).toMatch(/front 9/);
    expect(cadenceReason(R("nassau"), 18)).toMatch(/Final hole/);
  });

  it("crybaby reason only fires in the crybaby phase (holes 15+)", () => {
    // Hole 5 with crybaby active: other mechanics could fire first, or generic.
    // Just verify the crybaby copy doesn't leak earlier.
    const earlyReason = cadenceReason(R("drivers_others_carts", ["crybaby"]), 5);
    expect(earlyReason).not.toMatch(/Crybaby phase/);
    const lateReason = cadenceReason(R("drivers_others_carts", ["crybaby"]), 16);
    expect(lateReason).toMatch(/Crybaby phase/);
  });
});

describe("exhaustiveness of CaptureCadence union", () => {
  it("every variant is labelable (compile-time check)", () => {
    expect(cadenceLabel({ type: "every_hole" })).toBe("every_hole");
    expect(cadenceLabel({ type: "holes", holes: [9, 18] })).toBe("holes:[9,18]");
    expect(cadenceLabel({ type: "none" })).toBe("none");
  });
});
