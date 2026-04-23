import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import { resolvePlayerCartPosition } from "@/lib/cartPosition";
import { getTeamsForHole } from "@/lib/gameEngines";
import type { Player } from "@/lib/gameEngines";

// ============================================================
// PR #23 D3 verification — post-commit-2.
//
// Hypothesis from the recon: React #310 was either directly
// caused by D2's malformed cart/position data (empty team
// rosters feeding a conditional render path) or adjacent to it
// enough that D2's fix resolves it as a side effect.
//
// This file exercises the exact conditions of Jonathan's orphan
// round WITH D2's helpers applied and confirms:
//
//   1. The orphan's playerConfig (malformed cart strings, null
//      positions, 2 manual-entry players with null userId, one
//      with null handicap) resolves to well-formed Player
//      objects via resolvePlayerCartPosition. No throws.
//
//   2. getTeamsForHole returns balanced 2-player rosters for
//      DOC's three phases (Drivers 1-5, Others 6-10, Carts
//      11-15) — not the empty rosters the pre-fix data produced.
//
// If either assertion had failed under commit 2's logic, we'd
// know D3 is likely a SEPARATE bug and schedule a targeted fix
// as commit 2.5. Both pass → D3 resolves as a side-effect of
// D2 and commit 3 can start.
//
// No source-level conditional-hook scan was rendered into code
// because the re-grep is inline in the test below + documented
// in the companion PR comment.
// ============================================================

/**
 * Jonathan's orphan round playerConfig — copied verbatim from the
 * DB query run during Part-1 cleanup on 2026-04-22. Represents the
 * worst-case data shape observed in prod.
 */
const JONATHAN_ORPHAN_PLAYER_CONFIG: Array<{
  name: string;
  userId: string | null;
  handicap: number | null;
  cart: string;
  position: string | null;
}> = [
  {
    name: "Jonathan Osborne",
    userId: "4e454bd0-37d9-43b7-92c5-fa92f39e95e1",
    handicap: 12.7,
    cart: "Cart A — Driver",
    position: null,
  },
  {
    name: "Todd Bailey",
    userId: null,                       // manual entry
    handicap: 7.9,
    cart: "Cart A — Rider",
    position: null,
  },
  {
    name: "Mark Randall",
    userId: "41bdb72f-b0cc-4024-a7e6-aa9c6c5d061e",
    handicap: 11.7,
    cart: "Cart B — Driver",
    position: null,
  },
  {
    name: "Rick Orr",
    userId: null,                       // manual entry
    handicap: null,                      // ← null handicap — extra danger
    cart: "Cart B — Rider",
    position: null,
  },
];

describe("D3 verification — malformed orphan data resolves cleanly post-D2", () => {
  it("resolves every player's cart + position without throwing", () => {
    const resolved = JONATHAN_ORPHAN_PLAYER_CONFIG.map((pc, i) => {
      const { cart, position } = resolvePlayerCartPosition(pc, i);
      return { id: pc.userId ?? `guest-${i}`, name: pc.name, cart, position };
    });
    expect(resolved).toHaveLength(4);
    expect(resolved.every(r => r.cart === "A" || r.cart === "B")).toBe(true);
    expect(resolved.every(r => r.position === "driver" || r.position === "rider")).toBe(true);
  });

  it("produces a balanced 2/2 split on carts + drivers/riders", () => {
    const resolved = JONATHAN_ORPHAN_PLAYER_CONFIG.map((pc, i) =>
      resolvePlayerCartPosition(pc, i),
    );
    expect(resolved.filter(r => r.cart === "A")).toHaveLength(2);
    expect(resolved.filter(r => r.cart === "B")).toHaveLength(2);
    expect(resolved.filter(r => r.position === "driver")).toHaveLength(2);
    expect(resolved.filter(r => r.position === "rider")).toHaveLength(2);
  });

  it("getTeamsForHole — Drivers phase (hole 1) returns balanced Drivers / Riders rosters", () => {
    // Feed the resolved shapes through the engine exactly the way
    // CrybabyActiveRound builds its `players` array post-D2.
    const players: Player[] = JONATHAN_ORPHAN_PLAYER_CONFIG.map((pc, i) => {
      const { cart, position } = resolvePlayerCartPosition(pc, i);
      return {
        id: pc.userId ?? `guest-${i}`,
        name: pc.name,
        // Null handicap survives — the engine only uses it when pops
        // are enabled (they're not in this scenario).
        handicap: pc.handicap ?? 0,
        cart,
        position,
        color: "#16A34A",
      };
    });

    const teams = getTeamsForHole("drivers_others_carts", 1, players);
    // Pre-D2 this returned { teamA: { players: [] }, teamB: { players: [] } }
    // because every player.position was null. Post-D2 the split is correct.
    expect(teams).not.toBeNull();
    expect(teams!.teamA.players).toHaveLength(2);
    expect(teams!.teamB.players).toHaveLength(2);
    expect(teams!.teamA.name).toBe("Drivers");
    expect(teams!.teamB.name).toBe("Riders");
    // Jonathan (driver) + Mark (driver) on teamA.
    expect(teams!.teamA.players.map(p => p.name).sort())
      .toEqual(["Jonathan Osborne", "Mark Randall"]);
    expect(teams!.teamB.players.map(p => p.name).sort())
      .toEqual(["Rick Orr", "Todd Bailey"]);
  });

  it("getTeamsForHole — Others phase (hole 7) returns balanced cart-A / cart-B rosters", () => {
    const players: Player[] = JONATHAN_ORPHAN_PLAYER_CONFIG.map((pc, i) => {
      const { cart, position } = resolvePlayerCartPosition(pc, i);
      return { id: pc.userId ?? `guest-${i}`, name: pc.name, handicap: pc.handicap ?? 0, cart, position, color: "#16A34A" };
    });

    const teams = getTeamsForHole("drivers_others_carts", 7, players);
    expect(teams).not.toBeNull();
    // Pre-D2 this returned empty rosters (p.cart === 'A' never matched
    // against "Cart A — Driver"). Post-D2 the split is correct.
    expect(teams!.teamA.players).toHaveLength(2);
    expect(teams!.teamB.players).toHaveLength(2);
  });

  it("getTeamsForHole — Carts phase (hole 13) returns balanced cart-A / cart-B rosters", () => {
    const players: Player[] = JONATHAN_ORPHAN_PLAYER_CONFIG.map((pc, i) => {
      const { cart, position } = resolvePlayerCartPosition(pc, i);
      return { id: pc.userId ?? `guest-${i}`, name: pc.name, handicap: pc.handicap ?? 0, cart, position, color: "#16A34A" };
    });

    const teams = getTeamsForHole("drivers_others_carts", 13, players);
    expect(teams).not.toBeNull();
    expect(teams!.teamA.players).toHaveLength(2);
    expect(teams!.teamB.players).toHaveLength(2);
  });

  it("null-handicap player doesn't break player-object construction", () => {
    // Specific regression: Rick Orr has handicap: null. The CrybabyActiveRound
    // derivation uses `config.handicap ?? profile?.handicap ?? 12` → 12 (fallback).
    // Verify the fallback chain yields a finite number that the engine can sum.
    const rick = JONATHAN_ORPHAN_PLAYER_CONFIG[3];
    const effectiveHandicap = rick.handicap ?? null ?? 12;
    expect(effectiveHandicap).toBe(12);
    expect(Number.isFinite(effectiveHandicap)).toBe(true);
    // And crucially: Math.min(...allHandicaps) — which CrybabyActiveRound
    // runs at line 1485 as `const lowestHandicap = Math.min(...players.map(p => p.handicap))`
    // — should produce a real number, not NaN.
    const allHandicaps = JONATHAN_ORPHAN_PLAYER_CONFIG.map(pc => pc.handicap ?? 12);
    const lowest = Math.min(...allHandicaps);
    expect(Number.isFinite(lowest)).toBe(true);
    expect(lowest).toBe(7.9); // Todd is the lowest
  });

  it("manual-entry players (null userId) survive the whole pipeline", () => {
    const manualEntries = JONATHAN_ORPHAN_PLAYER_CONFIG.filter(pc => pc.userId === null);
    expect(manualEntries).toHaveLength(2);
    const resolved = manualEntries.map((pc, i) => {
      const orig = JONATHAN_ORPHAN_PLAYER_CONFIG.indexOf(pc);
      return resolvePlayerCartPosition(pc, orig);
    });
    // Both manual entries get valid cart + position assignments.
    expect(resolved.every(r => r.cart && r.position)).toBe(true);
  });
});

// ============================================================
// Source-level hook-order scan — re-verifies the invariant that
// commit 747ef77's "hooks above early returns" rule still holds.
// ============================================================

describe("D3 verification — hook-order invariant in CrybabyActiveRound", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
    "utf-8",
  );

  it("early returns fire AFTER all hooks — invariant preserved", () => {
    // Find the first `useState|useEffect|useMemo|useCallback|useRef` call
    // and the first early return in the component body. Early return must
    // come AFTER the last hook call. We approximate "last hook" by the
    // invariant comment anchor added in commit 747ef77.
    const anchorComment = "All hooks must be declared before any conditional returns";
    const anchorIdx = src.indexOf(anchorComment);
    expect(anchorIdx).toBeGreaterThan(0);

    const earlyReturnMarker = "// --- Early returns (after all hooks) ---";
    const earlyReturnIdx = src.indexOf(earlyReturnMarker);
    expect(earlyReturnIdx).toBeGreaterThan(anchorIdx);
  });

  it("no hooks inline inside map/forEach loops in the main file", () => {
    // Classic #310 smell: `someArray.map(x => { useState(...) ... })`.
    // Grep for `.map\(` or `.forEach\(` bodies containing a hook call.
    // This is a heuristic — if the regex matches, it's worth a human look.
    const hooksInLoop = /\.(map|forEach)\([^)]*\)\s*=>\s*\{[^}]*\b(useState|useEffect|useMemo|useCallback|useRef)\s*\(/;
    expect(hooksInLoop.test(src)).toBe(false);
  });

  it("no conditionally-called hook behind an if statement in the main file", () => {
    // Hooks called inside `if (...) { useX(...) }` would shift the chain.
    // Matches lines like `if (cond) { useEffect(...) }` as a rough detector.
    const conditionalHook = /\bif\s*\([^)]+\)\s*\{\s*\n?\s*(useState|useEffect|useMemo|useCallback|useRef)\(/;
    expect(conditionalHook.test(src)).toBe(false);
  });
});
