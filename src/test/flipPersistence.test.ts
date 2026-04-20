import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Commit 3 guards — persistence + apply-capture fix for Flip.
//
// These tests lock in:
//   1. `saveGameState`'s parameter type accepts the new Flip fields
//      (flipState, flipConfig, crybabyState) so CrybabyActiveRound
//      can pass them through without a `as unknown as` hack.
//   2. `GameStatePersisted` / `GameStateSnapshot` are kept in sync
//      (both carry the new optional fields).
//   3. The apply-capture edge function reads `gameState.flipState`
//      (NEW) with a fallback to legacy `gameState.flipTeams` — and
//      passes both a `flipTeamsInput` AND `flipConfigInput` into
//      replayRound, which is the widened signature the engine
//      (Commit 2) accepts.
//
// Also exercises the runtime persistence path by mocking the
// supabase client and verifying saveGameState writes the full
// flipState blob into course_details.game_state JSONB.
// ============================================================

// --- Mock the supabase client so saveGameState is exercisable ---
type JsonRow = { course_details: Record<string, unknown> | null };
let latestInsertedCourseDetails: unknown = null;
let storedRow: JsonRow = { course_details: null };

vi.mock("@/integrations/supabase/client", () => {
  const from = () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: storedRow, error: null }),
      }),
    }),
    update: (payload: { course_details: unknown }) => ({
      eq: async () => {
        latestInsertedCourseDetails = payload.course_details;
        storedRow = { course_details: payload.course_details as Record<string, unknown> };
        return { error: null };
      },
    }),
  });
  return { supabase: { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } } };
});

beforeEach(() => {
  latestInsertedCourseDetails = null;
  storedRow = { course_details: null };
});

// ============================================================
// Runtime: saveGameState persists the full Flip shape
// ============================================================

describe("saveGameState — persists Flip per-hole state", () => {
  it("writes flipState, flipConfig, and crybabyState into course_details.game_state", async () => {
    const { saveGameState } = await import("@/lib/db");
    await saveGameState("round-1", {
      currentHole: 7,
      carryOver: 0,
      totals: { p1: -4, p2: 4, p3: 0, p4: -2, p5: 2 },
      flipState: { teamsByHole: { 1: { dummy: true } }, currentHole: 7 },
      flipConfig: { baseBet: 4, carryOverWindow: 3 },
      crybabyState: undefined,
    });
    const written = latestInsertedCourseDetails as { game_state?: Record<string, unknown> } | null;
    expect(written?.game_state).toBeDefined();
    const gs = written!.game_state!;
    expect(gs.currentHole).toBe(7);
    expect(gs.flipState).toEqual({ teamsByHole: { 1: { dummy: true } }, currentHole: 7 });
    expect(gs.flipConfig).toEqual({ baseBet: 4, carryOverWindow: 3 });
  });

  it("preserves other fields of course_details when writing game_state (spread-merge)", async () => {
    const { saveGameState } = await import("@/lib/db");
    storedRow = { course_details: { pars: [4, 4, 4], handicaps: [1, 2, 3] } };
    await saveGameState("round-1", {
      currentHole: 2,
      carryOver: 0,
      totals: {},
      flipState: { teamsByHole: {}, currentHole: 2 },
    });
    const written = latestInsertedCourseDetails as { pars?: unknown; handicaps?: unknown; game_state?: unknown };
    expect(written.pars).toEqual([4, 4, 4]);
    expect(written.handicaps).toEqual([1, 2, 3]);
    expect(written.game_state).toBeDefined();
  });
});

// ============================================================
// Source guards: signature widening + apply-capture fix
// ============================================================

describe("saveGameState / GameStateSnapshot — signature widening source guards", () => {
  it("db.ts exports GameStatePersisted with flipState + flipConfig + crybabyState optional fields", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/lib/db.ts"), "utf-8");
    // Must define a real interface (not inline anonymous on saveGameState).
    expect(src).toMatch(/export interface GameStatePersisted\s*\{/);
    // Must include the 3 new optional Flip fields.
    expect(src).toMatch(/flipState\?:\s*unknown/);
    expect(src).toMatch(/flipConfig\?:\s*unknown/);
    expect(src).toMatch(/crybabyState\?:\s*unknown/);
    // Signature of saveGameState must use the new type (not the narrow inline one).
    expect(src).toMatch(/saveGameState\(roundId:\s*string,\s*state:\s*GameStatePersisted\)/);
  });

  it("useRoundPersistence.GameStateSnapshot carries the same new optional fields", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useRoundPersistence.ts"),
      "utf-8",
    );
    expect(src).toMatch(/export interface GameStateSnapshot[\s\S]*?flipState\?:\s*unknown/);
    expect(src).toMatch(/flipConfig\?:\s*unknown/);
    expect(src).toMatch(/crybabyState\?:\s*unknown/);
  });
});

describe("apply-capture edge function — Flip state wiring", () => {
  it("reads gameState.flipState (new) with legacy flipTeams fallback", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/apply-capture/index.ts"),
      "utf-8",
    );
    // The OLD code was:   const flipTeams = (gameState.flipTeams as ...) || null;
    // The NEW code reads gameState.flipState first, then falls back to flipTeams.
    expect(src).toMatch(/gameState\.flipState/);
    expect(src).toMatch(/gameState\.flipConfig/);
    // Legacy fallback must still be present so any historical row stays replay-safe.
    expect(src).toMatch(/gameState\.flipTeams/);
    // The two inputs must be constructed from a `game_type === 'flip'` branch.
    expect(src).toMatch(/round\.game_type[\s\S]*?===\s*['"]flip['"]/);
  });

  it("passes both flipTeamsInput AND flipConfigInput into replayRound", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/apply-capture/index.ts"),
      "utf-8",
    );
    // replayRound(...) call must include both new args (last two positional args).
    expect(src).toMatch(/replayRound\([\s\S]*?flipTeamsInput[\s\S]*?flipConfigInput[\s\S]*?\)/);
  });

  it("imports FlipState + FlipConfig + FlipTeamsInput types from the shared engine", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/apply-capture/index.ts"),
      "utf-8",
    );
    expect(src).toMatch(/type\s+FlipState/);
    expect(src).toMatch(/type\s+FlipConfig/);
    expect(src).toMatch(/type\s+FlipTeamsInput/);
  });
});
