import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { findPlayerConfig } from "@/lib/playerConfigMatch";

// ============================================================
// Jonathan's round_player ordering regression — 2026-04-30
//
// On 2026-04-30 Jonathan reported on-course (DOC round, Westlake CC):
//   "you have Michael Said and Nick Moncure popping on hole 1 but
//    not Jonathan. this is bad math. we pop off the lowest handicap.
//    we've been through this again and again."
//
// Cause: PR #30 D4-A's `start_round` RPC inserts every round_players
// row in a single transaction. Postgres assigns NOW() at transaction-
// snapshot time, so all four rows got the same created_at value.
// Subsequent reads via `.order("created_at")` had no tiebreaker, so
// the rows came back in non-deterministic order. The page-level
// player construction assumed `dbPlayers[i] ↔ playerConfig[i]`, so
// when the DB shuffled the rows, Michael's handicap (6) ended up
// rendering on Jonathan's row (handicap 11) and vice versa.
//
// Symptom on hole 1: relative diffs flipped. Michael (the new
// "highest" by mistake) showed pops; Jonathan (the new "lowest")
// did not. From Jonathan's POV the math was wrong.
//
// Fix: match playerConfig to round_players rows by user_id (or
// guest_name for guests), not by array index. See
// src/lib/playerConfigMatch.ts.
//
// This file is a regression test for both:
//   1. The findPlayerConfig helper directly (unit test).
//   2. Source-level guards: every page that reads round_players +
//      playerConfig in the same render pass MUST use findPlayerConfig
//      (or otherwise match by user_id) — never bare positional
//      indexing on a fresh atomic-insert round.
// ============================================================

describe("jonathan round_player ordering — D4-A regression", () => {
  describe("findPlayerConfig helper", () => {
    const config = [
      { userId: "u-jonathan", name: "Jonathan", handicap: 11 },
      { userId: "u-michael", name: "Michael", handicap: 6 },
      { userId: null, name: "Nick (guest)", handicap: 17 },
      { userId: "u-todd", name: "Todd", handicap: 8 },
    ];

    it("matches signed-in players by user_id regardless of order", () => {
      // DB returned rows in scrambled order — what would have crashed
      // the array-index alignment in the field.
      const dbPlayers = [
        { user_id: "u-michael", guest_name: null }, // index 0
        { user_id: "u-jonathan", guest_name: null }, // index 1
        { user_id: "u-todd", guest_name: null }, // index 2
        { user_id: null, guest_name: "Nick (guest)" }, // index 3
      ];

      // Jonathan must end up with the handicap-11 config even though
      // his row is at DB-index 1 and his config is at config-index 0.
      const jonathanCfg = findPlayerConfig(dbPlayers[1], config, 1);
      expect(jonathanCfg.handicap).toBe(11);
      expect(jonathanCfg.name).toBe("Jonathan");

      const michaelCfg = findPlayerConfig(dbPlayers[0], config, 0);
      expect(michaelCfg.handicap).toBe(6);
      expect(michaelCfg.name).toBe("Michael");

      const toddCfg = findPlayerConfig(dbPlayers[2], config, 2);
      expect(toddCfg.handicap).toBe(8);

      const nickCfg = findPlayerConfig(dbPlayers[3], config, 3);
      expect(nickCfg.handicap).toBe(17);
    });

    it("matches guest players by guest_name when user_id is null on both sides", () => {
      const dbPlayer = { user_id: null, guest_name: "Nick (guest)" };
      const cfg = findPlayerConfig(dbPlayer, config, 99 /* bogus fallback */);
      expect(cfg.handicap).toBe(17);
      expect(cfg.name).toBe("Nick (guest)");
    });

    it("never matches a guest config to a signed-in player whose name happens to collide", () => {
      const collidingConfig = [
        { userId: null, name: "Jonathan", handicap: 99 }, // a guest named Jonathan
        { userId: "u-jonathan", name: "Jonathan", handicap: 11 },
      ];
      const signedInJonathan = { user_id: "u-jonathan", guest_name: null };
      const cfg = findPlayerConfig(signedInJonathan, collidingConfig, 0);
      // Must pick the userId match, not the guest at index 0.
      expect(cfg.handicap).toBe(11);
    });

    it("falls back to positional index for legacy rounds (no userId on configs)", () => {
      const legacyConfig = [
        { name: "A", handicap: 10 },
        { name: "B", handicap: 20 },
      ];
      const dbPlayer = { user_id: "some-uuid", guest_name: null };
      const cfg = findPlayerConfig(dbPlayer, legacyConfig, 1);
      expect(cfg.handicap).toBe(20);
    });

    it("returns empty object when playerConfig is null/empty", () => {
      expect(findPlayerConfig({ user_id: "x" }, null, 0)).toEqual({});
      expect(findPlayerConfig({ user_id: "x" }, [], 0)).toEqual({});
    });
  });

  describe("source-level guards: pages must match by user_id, not by index", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");

    // Pages that read round_players + playerConfig in the same render
    // pass and were affected by Jonathan's 2026-04-30 regression.
    const guardedFiles = [
      "src/pages/CrybabyActiveRound.tsx",
      "src/pages/RoundDetailPage.tsx",
      "src/pages/RoundEditScores.jsx",
      "src/pages/CrybabyFeed.jsx",
    ];

    for (const rel of guardedFiles) {
      it(`${rel} imports findPlayerConfig`, () => {
        const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
        expect(src).toMatch(
          /from\s+["']@\/lib\/playerConfigMatch["']/,
        );
        expect(src).toMatch(/findPlayerConfig/);
      });
    }

    it("apply-capture edge function imports findPlayerConfig", () => {
      const src = fs.readFileSync(
        path.join(repoRoot, "supabase/functions/apply-capture/index.ts"),
        "utf8",
      );
      expect(src).toMatch(
        /from\s+["']\.\.\/_shared\/playerConfigMatch\.ts["']/,
      );
      expect(src).toMatch(/findPlayerConfig\s*\(/);
    });

    it("CrybabyActiveRound.tsx no longer uses bare positional playerConfig indexing", () => {
      const src = fs.readFileSync(
        path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
        "utf8",
      );
      // The pre-fix shape was `playerConfig?.[i]` or
      // `playerConfig?.[dbPlayers.indexOf(p)]`. Either pattern is
      // forbidden — the fix routes through findPlayerConfig.
      expect(src).not.toMatch(/playerConfig\?\.\[i\]\s*\|\|\s*\{\}/);
      expect(src).not.toMatch(/playerConfig\?\.\[dbPlayers\.indexOf/);
    });
  });

  describe("source-level guards: round_players queries have stable ordering", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");

    it("db.ts loadRound has .order(\"id\") tiebreaker on round_players", () => {
      const src = fs.readFileSync(
        path.join(repoRoot, "src/lib/db.ts"),
        "utf8",
      );
      // Look for the ordering pattern: .order("created_at").order("id")
      // somewhere after a round_players query. We use a multiline-friendly
      // substring check rather than a strict regex around the table name.
      expect(src).toMatch(/\.order\("created_at"\)\s*\.order\("id"\)/);
    });

    it("apply-capture has .order(\"id\") tiebreaker on round_players", () => {
      const src = fs.readFileSync(
        path.join(repoRoot, "supabase/functions/apply-capture/index.ts"),
        "utf8",
      );
      expect(src).toMatch(/\.order\("created_at"\)\s*\.order\("id"\)/);
    });
  });

  describe("source-level guard: start_round migration uses clock_timestamp()", () => {
    it("migration assigns clock_timestamp() to round_players.created_at", () => {
      const repoRoot = path.resolve(__dirname, "..", "..");
      const src = fs.readFileSync(
        path.join(
          repoRoot,
          "supabase/migrations/20260430000000_round_player_distinct_timestamps.sql",
        ),
        "utf8",
      );
      expect(src).toMatch(/clock_timestamp\(\)/);
      // And the function it patches.
      expect(src).toMatch(/CREATE OR REPLACE FUNCTION public\.start_round/);
    });
  });
});
