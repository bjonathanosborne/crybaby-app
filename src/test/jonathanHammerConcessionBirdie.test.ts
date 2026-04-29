import { describe, it, expect } from "vitest";
import {
  calculateTeamHoleResult,
  replayRound,
  type GameSettings,
  type Player,
  type TeamInfo,
  type ReplayHoleInput,
} from "@/lib/gameEngines";

// ============================================================
// PR #31 — Jonathan's hammer-concession-with-birdie regression test.
//
// On 2026-04-28 Jonathan reported on-course (DOC round):
//   "Conceding a hammer ended the hole. Scores were not entered,
//    no birdie multiplier could apply, hole resolved at the conceded
//    multiplier alone."
//
// And separately:
//   "Entering scores hid the hammer button. Couldn't throw a late-
//    hole hammer."
//
// Recon (PR #31 description) traced both bugs to the same
// architectural smell: hammer state was entangled with hole-advance
// state. Concession short-circuited via `setShowResult(...)` (Bug 1),
// and the button render gate keyed on `!allScored` (Bug 2).
//
// PR #31 fix (Commit 1):
//   - Concession sets `hammerResolved=true` + locks
//     `concededHammerWinnerTeamId`. Hole continues. Scores still get
//     entered. When all scored, the engine's new conceded-hammer
//     branch computes the right stacked stake (base × 2^depth
//     × birdieMultiplier).
//   - Hammer button gate flipped to `!hammerResolved`. Stays visible
//     from hole start through advance, regardless of score state.
//     Disabled-with-tooltip after concession.
//
// This file is the explicit regression guard the user requested,
// matching the pattern from PR #28's
// `jonathanSeaIslandRegression.test.ts` and PR #30's
// `docFourPlayerLock.test.ts`.
//
// The failure mode it locks down: a 4-player DOC hole where a depth-1
// hammer is conceded, scores are entered, one player makes a gross
// birdie, and the settlement reflects 4× base bet (2× hammer × 2×
// birdie). If a future refactor breaks the conceded-hammer branch
// or re-introduces the score-state-entangled button gate, these
// tests fail.
// ============================================================

function makeSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    hammer: true,
    hammerInitiator: "any",
    hammerMaxDepth: "1",
    crybaby: false,
    crybabHoles: 3,
    crybabHammerRule: "allowed",
    birdieBonus: true,
    birdieMultiplier: 2,
    pops: false,
    noPopsParThree: true,
    carryOverEnabled: false, // not relevant for fold; off avoids unrelated math noise
    carryOverCap: "∞",
    handicapPercent: 100,
    presses: false,
    pressType: "auto",
    ...overrides,
  };
}

// Canonical 4-player DOC roster (matches the Drivers phase pairing
// used at hole 1: Driver A + Driver B vs Rider A + Rider B).
function makePlayers(): Player[] {
  return [
    { id: "a", name: "Alice", handicap: 10, cart: "A", position: "driver", color: "#16A34A" },
    { id: "b", name: "Bob",   handicap: 10, cart: "A", position: "rider",  color: "#3B82F6" },
    { id: "c", name: "Carol", handicap: 10, cart: "B", position: "driver", color: "#F59E0B" },
    { id: "d", name: "Dave",  handicap: 10, cart: "B", position: "rider",  color: "#DC2626" },
  ];
}

function driversPhaseTeams(players: Player[]): TeamInfo {
  // Drivers phase (holes 1-5): drivers vs riders.
  return {
    teamA: { name: "Drivers", players: [players[0], players[2]], color: "#16A34A" },
    teamB: { name: "Riders",  players: [players[1], players[3]], color: "#8B5CF6" },
  };
}

// ------------------------------------------------------------
// Block 1 — Engine-level: the exact Sea Island scenario.
// ------------------------------------------------------------

describe("Jonathan's hammer-concession-with-birdie — engine direct call", () => {
  const players = makePlayers();
  const teams = driversPhaseTeams(players);
  const settings = makeSettings();
  const par = 4;
  const holeValue = 2;

  it("depth-1 hammer conceded by Riders, gross birdie by a Driver: 4× stake to Drivers", () => {
    // Setup:
    //   - Drivers (A) threw a depth-1 hammer.
    //   - Riders (B) folded — concededHammerWinnerTeamId = 'A'.
    //   - Scores: Alice (Driver) makes a 3 (gross birdie at par 4).
    //     Carol = 4. Bob = 5. Dave = 5. Drivers winning anyway.
    //   - Birdie multiplier should stack on top of the locked hammer.
    //
    // Math: $2 × 2^1 (hammer) × 2 (birdie) = $8 per player.
    // Drivers (a, c): +$8 each. Riders (b, d): −$8 each.
    const result = calculateTeamHoleResult(
      players,
      teams,
      { a: 3, b: 5, c: 4, d: 5 },
      par,
      holeValue,
      0,        // no carryOver
      1,        // hammerDepth = 1 (depth at which Riders folded)
      settings,
      10, 1,    // lowestHandicap, holeHandicapRank
      "∞",      // carryOverCap (irrelevant, not a push)
      "A",      // concededHammerWinnerTeamId — Drivers won the fold
    );

    expect(result.folded, "result is marked folded").toBe(true);
    expect(result.push, "concession resolves to a non-push").toBe(false);
    expect(result.winnerName, "winner is the locked team").toBe("Drivers");
    expect(result.amount, "stake = $2 × 2 (hammer) × 2 (birdie) = $8").toBe(8);

    // Per-player check
    const byId = Object.fromEntries(result.playerResults.map(pr => [pr.id, pr.amount]));
    expect(byId.a, "Alice (Driver, made the birdie) wins $8").toBe(8);
    expect(byId.c, "Carol (Driver) wins $8").toBe(8);
    expect(byId.b, "Bob (Rider, conceded) loses $8").toBe(-8);
    expect(byId.d, "Dave (Rider, conceded) loses $8").toBe(-8);
  });

  it("depth-1 hammer conceded, NO birdie: stake stays at 2× base (the bug-free non-birdie case)", () => {
    const result = calculateTeamHoleResult(
      players,
      teams,
      { a: 4, b: 5, c: 4, d: 5 },  // par par par par — no birdie
      par,
      holeValue,
      0,
      1,
      settings,
      10, 1, "∞",
      "A",
    );
    expect(result.folded).toBe(true);
    expect(result.amount, "stake = $2 × 2 = $4 (no birdie)").toBe(4);
    const byId = Object.fromEntries(result.playerResults.map(pr => [pr.id, pr.amount]));
    expect(byId.a).toBe(4);
    expect(byId.c).toBe(4);
    expect(byId.b).toBe(-4);
    expect(byId.d).toBe(-4);
  });

  it("depth-1 hammer conceded by Riders BUT a Rider makes the gross birdie: birdie still stacks (multiplier doesn't care which team)", () => {
    // Edge case: the conceding (losing) team has the gross birdie.
    // Per the spec: "Birdie multiplier applies on top of the locked
    // hammer multiplier" — doesn't differentiate which team. The
    // birdie boosts the stake; conceding team still loses, just at
    // the higher multiplier.
    const result = calculateTeamHoleResult(
      players,
      teams,
      { a: 4, b: 3, c: 4, d: 5 },  // Bob (Rider) gross birdie
      par,
      holeValue,
      0,
      1,
      settings,
      10, 1, "∞",
      "A",   // Drivers still locked as winners
    );
    expect(result.amount, "stake doubled by Rider's birdie: $4 × 2 = $8").toBe(8);
    const byId = Object.fromEntries(result.playerResults.map(pr => [pr.id, pr.amount]));
    expect(byId.b, "Bob (made birdie, but on conceding team) loses $8").toBe(-8);
    expect(byId.a, "Alice wins $8 anyway").toBe(8);
  });

  it("depth-2 hammer conceded + birdie: stake stacks to 8× base (4× hammer × 2× birdie)", () => {
    // Variant from the user's spec:
    //   "gross eagle + conceded hammer = 8x stake (2x × 4x)"
    // — but here we test the depth-2 hammer path with a regular
    // birdie. Same total multiplier: 4× hammer × 2× birdie = 8×.
    const result = calculateTeamHoleResult(
      players,
      teams,
      { a: 3, b: 5, c: 4, d: 5 },
      par,
      holeValue,
      0,
      2,   // hammerDepth = 2
      settings,
      10, 1, "∞",
      "A",
    );
    expect(result.amount, "stake = $2 × 4 (hammer) × 2 (birdie) = $16").toBe(16);
  });

  it("conceded hammer with a NET birdie cancellation: birdie-forced-push is SUPPRESSED", () => {
    // PR #31 invariant: "Concession can't be undone by a net-birdie
    // cancellation." If a non-conceded hole would have produced a
    // birdie-forced-push (gross birdie on team X cancelled by net
    // birdie on team Y), the conceded path overrides — winner stays
    // locked, birdie stacks normally.
    //
    // Setup: pops on, lower-handicap player on conceding team makes
    // a net birdie that would normally cancel. Confirm the conceded
    // path stays at locked-winner.
    const popsSettings = makeSettings({ pops: true });
    const popsPlayers: Player[] = [
      { id: "a", name: "Alice", handicap: 0,  cart: "A", position: "driver", color: "#16A34A" },
      { id: "b", name: "Bob",   handicap: 18, cart: "A", position: "rider",  color: "#3B82F6" },
      { id: "c", name: "Carol", handicap: 0,  cart: "B", position: "driver", color: "#F59E0B" },
      { id: "d", name: "Dave",  handicap: 18, cart: "B", position: "rider",  color: "#DC2626" },
    ];
    const popsTeams = driversPhaseTeams(popsPlayers);
    // Alice (low-hdcp, no strokes): gross 3 = gross birdie.
    // Dave (high-hdcp, gets strokes): gross 4 = net 4-1 = 3 (net birdie at par 4).
    // Pre-PR-#31 in non-conceded path: would force a push.
    // PR #31: with concession, push is suppressed; Drivers locked.
    const result = calculateTeamHoleResult(
      popsPlayers,
      popsTeams,
      { a: 3, b: 5, c: 5, d: 4 },
      4,
      holeValue,
      0, 1,
      popsSettings,
      0, 1, "∞",
      "A",
    );
    expect(result.push, "concession suppresses birdie-forced-push").toBe(false);
    expect(result.winnerName).toBe("Drivers");
    expect(result.amount, "stake stacks despite the net-birdie").toBe(8);
  });
});

// ------------------------------------------------------------
// Block 2 — Replay equivalence: the live ≡ replay release gate.
// ------------------------------------------------------------

describe("Jonathan's regression — replay produces the same result as direct engine call", () => {
  it("18-hole DOC replay with a depth-1 fold + birdie at hole 1 settles to 4× stake", () => {
    const players = makePlayers();
    const settings = makeSettings();
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const holeValue = 2;

    // Hole 1: depth-1 hammer thrown by Drivers, conceded by Riders,
    // Alice makes gross birdie. All other holes: par-par-par-par
    // (no money movement; ties produce zero carry since
    // carryOverEnabled=false).
    const holes: ReplayHoleInput[] = [
      {
        holeNumber: 1,
        scores: { a: 3, b: 5, c: 4, d: 5 },
        hammerDepth: 1,
        folded: true,
        foldWinnerTeamId: "A",
      },
      ...Array.from({ length: 17 }, (_, i) => ({
        holeNumber: i + 2,
        scores: { a: 4, b: 4, c: 4, d: 4 },
        hammerDepth: 0,
        folded: false,
      })),
    ];

    const result = replayRound("drivers_others_carts", players, pars, handicaps, holeValue, settings, holes);

    expect(result.totals.a, "Alice (Driver) +$8 from hole 1 fold + birdie").toBe(8);
    expect(result.totals.c, "Carol (Driver) +$8 from hole 1").toBe(8);
    expect(result.totals.b, "Bob (Rider, conceded) -$8").toBe(-8);
    expect(result.totals.d, "Dave (Rider, conceded) -$8").toBe(-8);

    // Hole-1 result struct sanity
    const h1 = result.holeResults[0];
    expect(h1.folded).toBe(true);
    expect(h1.winnerName).toBe("Drivers");
    expect(h1.amount).toBe(8);
  });
});

// ------------------------------------------------------------
// Block 3 — Source-level: confirm the architectural fix shape.
// ------------------------------------------------------------

describe("Jonathan's regression — architectural invariants (source-level)", () => {
  it("useRoundState exports hammerResolved + concededHammerWinnerTeamId state", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useRoundState.ts"),
      "utf-8",
    );
    expect(src).toMatch(/hammerResolved:\s*boolean;/);
    expect(src).toMatch(/concededHammerWinnerTeamId:\s*string\s*\|\s*null;/);
    // Both reset on hole advance
    expect(src).toMatch(/hammerResolved:\s*false,\s*\n\s*concededHammerWinnerTeamId:\s*null,/);
  });

  it("handleHammerFold no longer calls setShowResult (the Bug 1 short-circuit)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // Find the handleHammerFold body and assert its contents.
    const foldMatch = src.match(/const handleHammerFold = \(\) => \{[\s\S]*?\n\s*\};/);
    expect(foldMatch).toBeTruthy();
    const foldBody = foldMatch?.[0] ?? "";
    expect(foldBody, "handleHammerFold must NOT call setShowResult anymore").not.toMatch(/setShowResult/);
    expect(foldBody, "handleHammerFold sets hammerResolved").toMatch(/setHammerResolved\(true\)/);
    expect(foldBody, "handleHammerFold locks the conceded winner").toMatch(/setConcededHammerWinnerTeamId\(lastHammerBy\)/);
  });

  it("makeFoldResult helper is deleted (no longer needed)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src, "makeFoldResult helper removed").not.toMatch(/const makeFoldResult/);
  });

  it("hammer button gate is !hammerResolved (was !allScored — the Bug 2 cause)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // The Bug 2 gate `settings.hammer && teams && !allScored && (() => {`
    // must no longer exist on the hammer button block.
    expect(src).not.toMatch(/settings\.hammer\s*&&\s*teams\s*&&\s*!allScored\s*&&/);
    // The new gate keys on hammerResolved (post-resolution branch).
    expect(src).toMatch(/if\s*\(\s*hammerResolved\s*\)\s*\{/);
    // Disabled-with-tooltip placeholder copy
    expect(src).toMatch(/Already hammered this hole/);
  });

  it("calculateTeamHoleResult takes concededHammerWinnerTeamId as its 12th param (engine signature)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/_shared/gameEngines.ts"),
      "utf-8",
    );
    expect(src).toMatch(
      /export function calculateTeamHoleResult\([\s\S]{0,800}concededHammerWinnerTeamId:\s*string\s*\|\s*null\s*=\s*null,?\s*\)/,
    );
    // Conceded branch present
    expect(src).toMatch(/if\s*\(\s*concededHammerWinnerTeamId\s*!==\s*null\s*\)\s*\{/);
  });

  it("replayRound's folded path routes through calculateTeamHoleResult (PR #31), not calculateFoldResult", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/_shared/gameEngines.ts"),
      "utf-8",
    );
    // The folded branch in replayRound must now call calculateTeamHoleResult
    // with foldWinnerTeamId as the conceded-winner argument.
    const foldedBranch = src.match(/if \(folded && teams && foldWinnerTeamId\) \{[\s\S]*?\}\s*else if/);
    expect(foldedBranch).toBeTruthy();
    const branchBody = foldedBranch?.[0] ?? "";
    expect(branchBody).toMatch(/calculateTeamHoleResult\(/);
    expect(branchBody).toMatch(/foldWinnerTeamId,?\s*\)/);
  });
});
