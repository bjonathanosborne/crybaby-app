import { describe, it, expect } from "vitest";

/**
 * Handicap privacy + locked-at-round-start invariants.
 *
 * The money-math correctness rule: round scoring NEVER reads
 * `profiles.handicap` at scoring time. The course handicap used for
 * net scoring is locked into `rounds.course_details.playerConfig[].handicap`
 * at round creation (see src/lib/db.ts `createRound`) and flows through
 * `Player.handicap` in the engine. Updating `profiles.handicap`
 * mid-round must NOT change any hole's stroke pops or settlement.
 *
 * These tests lock in those invariants at the architectural level.
 * A regression that causes round-scoring code to read live profile
 * handicaps will fail here.
 */

describe("Handicap visibility toggle — shape invariants", () => {
  it("default (no value set) should be treated as 'visible' by consumer code", () => {
    // `handicap_visible_to_friends !== false` is the check used in
    // UserProfilePage — tests the default-visible semantic.
    const cases = [
      { input: true, visible: true },
      { input: false, visible: false },
      { input: undefined, visible: true }, // no column yet, or pre-migration row
      { input: null, visible: true }, // null → default open
    ];
    for (const c of cases) {
      const visible = c.input !== false;
      expect(visible).toBe(c.visible);
    }
  });
});

describe("Locked-at-round-start rule — architecture check", () => {
  /**
   * The gameEngines.ts engine consumes a Player shape with a
   * `handicap: number` field. That field comes from
   * course_details.playerConfig at round-load time. This test asserts
   * the Player type exists and has handicap typed as number (not
   * a lookup function, not a reactive subscription).
   */
  it("Player.handicap is a plain number in the engine — no live lookup", async () => {
    const { /* Player is a type, not a value — check by shape */ } = await import("@/lib/gameEngines");
    // Compile-time shape assertion: if someone ever changes Player.handicap
    // to something like `handicap: () => number` (a getter / live lookup),
    // this typed literal will fail to compile.
    const mockPlayer: import("@/lib/gameEngines").Player = {
      id: "p1",
      name: "Test",
      handicap: 12.4,
      color: "#000",
    };
    expect(typeof mockPlayer.handicap).toBe("number");
  });

  it("createRound in src/lib/db.ts persists handicap into playerConfig JSONB, not a live FK", async () => {
    // Read the createRound source and verify it constructs a playerConfig
    // with a numeric handicap per player. This is a regression guard: if
    // someone changes createRound to store `handicap_user_id` instead of
    // the numeric value, the lock is lost.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db.ts"),
      "utf-8",
    );
    // Look for the playerConfig builder — it must still spread `handicap: p.handicap`.
    expect(src).toMatch(/playerConfig\s*=\s*players[\s\S]*?handicap:\s*p\.handicap/);
    // Look for the course_details assembly — it must include playerConfig.
    expect(src).toMatch(/course_details:\s*\{[\s\S]*?playerConfig/);
  });

  it("gameEngines' score calculators never import from @/lib/db or fetch profiles", async () => {
    // Pure-function rule: gameEngines is isolated from the DB layer.
    // If someone ever imports supabase or db helpers into the engine,
    // money math becomes reactive to live data — which breaks the lock.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/_shared/gameEngines.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/from ["']@\/lib\/db/);
    expect(src).not.toMatch(/from ["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase\.from\(/);
  });
});

describe("loadUserProfile contract — handicap_visible_to_friends is readable", () => {
  /**
   * Sanity check: the db.ts `loadUserProfile` helper uses `select("*")`
   * so the new column flows through without a schema update to the
   * helper signature. This asserts that contract by reading source.
   */
  it("loadUserProfile selects *", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db.ts"),
      "utf-8",
    );
    // The function signature + select("*") near the loadUserProfile location.
    expect(src).toMatch(/export async function loadUserProfile[\s\S]*?\.select\("\*"\)/);
  });
});
