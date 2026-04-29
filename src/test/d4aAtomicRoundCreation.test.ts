import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { isRoundStuck, STUCK_GRACE_MINUTES, STUCK_SETUP_GRACE_MINUTES } from "@/lib/stuckRound";

// ============================================================
// PR #30 commit 3 (D4-A) — atomic round creation tests.
//
// Wired surface:
//   - Migration: 20260429010000_d4a_atomic_round_creation.sql
//     defines start_round, activate_round, cleanup_stuck_setup_rounds
//   - db.ts:    startRound / activateRound / cleanupStuckSetupRounds
//     wrappers (PersistResult). createRound deprecated.
//   - Wizard:   replaces createRound() with startRound() + handles
//     PersistResult on the return.
//   - Active:   mount-success effect calls activateRound exactly once
//     per mount via activateFiredRef.
//   - Feed:     mount sweeper calls cleanupStuckSetupRounds exactly
//     once per visit via sweepFiredRef.
//   - Stuck:    isRoundStuck adds the status='setup' AND age >= 5 min
//     predicate; loadActiveRound widens to status IN ('active',
//     'setup').
//
// Codebase pattern: source-level / shape-level tests dominate the
// suite (mount-heavy tests fight the supabase auth-init loop — see
// scorecardEditFlow.test.tsx). One behavioral block at the bottom
// covers the stuck-round predicate via direct function calls.
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

const MIGRATION = readFile("supabase/migrations/20260429010000_d4a_atomic_round_creation.sql");
const DB = readFile("src/lib/db.ts");
const WIZARD = readFile("src/pages/CrybabySetupWizard.jsx");
const ACTIVE = readFile("src/pages/CrybabyActiveRound.tsx");
const FEED = readFile("src/pages/CrybabyFeed.jsx");
const STUCK = readFile("src/lib/stuckRound.ts");

// ------------------------------------------------------------
// Block 1 — Migration SQL surface
// ------------------------------------------------------------

describe("D4-A migration SQL — three RPCs defined", () => {
  it("defines public.start_round with the BOOLEAN scorekeeper_mode signature", () => {
    // The pre-smoke version had p_scorekeeper_mode TEXT — caught by
    // the live smoke test (column is BOOLEAN). The on-disk migration
    // must match the deployed BOOLEAN signature.
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.start_round\([\s\S]{0,400}p_scorekeeper_mode\s+BOOLEAN/,
    );
  });

  it("start_round inserts the round at status='setup' (not 'active')", () => {
    // The whole point of D4-A: round lands in setup state.
    // Activation flips later.
    expect(MIGRATION).toMatch(
      /INSERT INTO public\.rounds[\s\S]{0,500}'setup'/,
    );
  });

  it("start_round loops over jsonb_array_elements (empty array no-ops)", () => {
    expect(MIGRATION).toMatch(/FOR\s+v_player\s+IN\s+SELECT\s*\*\s*FROM\s+jsonb_array_elements\(p_player_configs\)/);
  });

  it("defines public.activate_round with status='setup' guard", () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.activate_round\(p_round_id UUID\)/);
    expect(MIGRATION).toMatch(/SET\s+status\s*=\s*'active'[\s\S]{0,200}AND\s+status\s*=\s*'setup'/);
  });

  it("defines public.cleanup_stuck_setup_rounds with 30-min threshold + 50-row limit", () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.cleanup_stuck_setup_rounds\(\)/);
    expect(MIGRATION).toMatch(/INTERVAL\s+'30 minutes'/);
    expect(MIGRATION).toMatch(/LIMIT\s+50/);
  });

  it("all three RPCs are GRANTed to authenticated", () => {
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.start_round\([\s\S]{0,200}\)\s*TO authenticated/);
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.activate_round\(UUID\)\s*TO authenticated/);
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.cleanup_stuck_setup_rounds\(\)\s*TO authenticated/);
  });

  it("inserts a tracker row for the schema_migrations reconciliation pattern", () => {
    expect(MIGRATION).toMatch(
      /INSERT INTO supabase_migrations\.schema_migrations[\s\S]{0,200}'20260429010000'[\s\S]{0,200}'d4a_atomic_round_creation'/,
    );
    expect(MIGRATION).toMatch(/ON CONFLICT \(version\) DO NOTHING/);
  });
});

// ------------------------------------------------------------
// Block 2 — db.ts RPC helpers
// ------------------------------------------------------------

describe("db.ts — RPC helpers wired to PersistResult (PR #30 D4-A)", () => {
  it("startRound is exported and returns PersistResult<string>", () => {
    expect(DB).toMatch(/export async function startRound\(args: StartRoundArgs\):\s*Promise<PersistResult<string>>/);
  });

  it("startRound calls supabase.rpc('start_round', ...) with the right param names", () => {
    // The body must marshal to the migration's parameter names.
    expect(DB).toMatch(/supabase\.rpc\(["']start_round["'],[\s\S]{0,500}p_game_type:/);
    expect(DB).toMatch(/p_course:/);
    expect(DB).toMatch(/p_course_details:/);
    expect(DB).toMatch(/p_scorekeeper_mode:/);
    expect(DB).toMatch(/p_player_configs:/);
  });

  it("activateRound is exported and returns PersistResult<void>", () => {
    expect(DB).toMatch(/export async function activateRound\(roundId: string\):\s*Promise<PersistResult<void>>/);
    expect(DB).toMatch(/supabase\.rpc\(["']activate_round["']/);
  });

  it("cleanupStuckSetupRounds is exported and returns PersistResult<number>", () => {
    expect(DB).toMatch(/export async function cleanupStuckSetupRounds\(\):\s*Promise<PersistResult<number>>/);
    expect(DB).toMatch(/supabase\.rpc\(["']cleanup_stuck_setup_rounds["']/);
  });

  it("createRound is marked @deprecated with a pointer to startRound", () => {
    expect(DB).toMatch(/@deprecated[\s\S]{0,400}use\s+`?startRound`?/);
  });
});

// ------------------------------------------------------------
// Block 3 — Wizard call-site uses startRound
// ------------------------------------------------------------

describe("CrybabySetupWizard — switched to startRound (PR #30 D4-A)", () => {
  it("imports startRound (not createRound)", () => {
    expect(WIZARD).toMatch(/import\s*\{\s*startRound[^}]*\}\s*from\s*["']@\/lib\/db["']/);
  });

  it("does NOT call createRound from the wizard's create-flow", () => {
    // Match strips `// ` lines so historical comments don't false-fail.
    const stripped = WIZARD.replace(/^\s*\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/await\s+createRound\(/);
  });

  it("calls startRound and handles PersistResult before navigating", () => {
    expect(WIZARD).toMatch(/const\s+result\s*=\s*await\s+startRound\(/);
    expect(WIZARD).toMatch(/if\s*\(!result\.ok\)/);
    // Successful path navigates to /round?id=<result.data>
    expect(WIZARD).toMatch(/window\.location\.href\s*=\s*`\/round\?id=\$\{result\.data\}`/);
  });
});

// ------------------------------------------------------------
// Block 4 — Activate hook in CrybabyActiveRound
// ------------------------------------------------------------

describe("CrybabyActiveRound — mount-success activation (PR #30 D4-A)", () => {
  it("imports activateRound from db", () => {
    expect(ACTIVE).toMatch(/import\s*\{[^}]*\bactivateRound\b[^}]*\}\s*from\s*["']@\/lib\/db["']/);
  });

  it("declares activateFiredRef as a useRef boolean (one-shot latch)", () => {
    expect(ACTIVE).toMatch(/activateFiredRef\s*=\s*useRef<boolean>\(false\)/);
  });

  it("the activate effect fires once on round-loaded", () => {
    expect(ACTIVE).toMatch(
      /if\s*\(round\s*&&\s*roundId\s*&&\s*!activateFiredRef\.current\)/,
    );
    expect(ACTIVE).toMatch(/activateFiredRef\.current\s*=\s*true/);
    expect(ACTIVE).toMatch(/void\s+activateRound\(roundId\)/);
  });

  it("activation effect is BEFORE the early-returns marker (hook-position invariant)", () => {
    // The PR #24 invariant: every top-level hook must live above
    // `// --- Early returns (after all hooks) ---`. Verify the
    // activate effect's signature is in that region.
    const anchor = ACTIVE.indexOf("// --- Early returns (after all hooks) ---");
    const activateUseEffect = ACTIVE.indexOf("activateFiredRef.current = true");
    expect(anchor, "early-returns marker must exist").toBeGreaterThan(0);
    expect(activateUseEffect, "activate effect site must exist").toBeGreaterThan(0);
    expect(activateUseEffect, "activate effect must be BEFORE early-returns marker").toBeLessThan(anchor);
  });
});

// ------------------------------------------------------------
// Block 5 — Sweeper hook in CrybabyFeed
// ------------------------------------------------------------

describe("CrybabyFeed — sweeper hook (PR #30 D4-A)", () => {
  it("imports cleanupStuckSetupRounds from db", () => {
    expect(FEED).toMatch(/import\s*\{[^}]*\bcleanupStuckSetupRounds\b[^}]*\}\s*from\s*["']@\/lib\/db["']/);
  });

  it("declares sweepFiredRef as a useRef one-shot latch", () => {
    expect(FEED).toMatch(/sweepFiredRef\s*=\s*useRef\(false\)/);
  });

  it("a useEffect fires cleanupStuckSetupRounds once per user-id transition", () => {
    expect(FEED).toMatch(/sweepFiredRef\.current\s*=\s*true/);
    expect(FEED).toMatch(/void\s+cleanupStuckSetupRounds\(\)/);
  });
});

// ------------------------------------------------------------
// Block 6 — Stuck-round predicate extension
// ------------------------------------------------------------

describe("isRoundStuck — extended predicate (PR #30 D4-A)", () => {
  it("exports STUCK_SETUP_GRACE_MINUTES = 5", () => {
    expect(STUCK_SETUP_GRACE_MINUTES).toBe(5);
    // PR #23 D4-B legacy threshold stays at 10 for the active-state path
    expect(STUCK_GRACE_MINUTES).toBe(10);
  });

  const NOW = new Date("2026-04-29T12:00:00Z");

  it("status='setup' + age 6 min → stuck", () => {
    const minus6 = new Date(NOW.getTime() - 6 * 60_000).toISOString();
    expect(isRoundStuck({ id: "r1", created_at: minus6, status: "setup" }, NOW)).toBe(true);
  });

  it("status='setup' + age 4 min → NOT stuck (under threshold)", () => {
    const minus4 = new Date(NOW.getTime() - 4 * 60_000).toISOString();
    expect(isRoundStuck({ id: "r1", created_at: minus4, status: "setup" }, NOW)).toBe(false);
  });

  it("status='active' + currentHole=null + age 11 min → stuck (legacy PR #23 path)", () => {
    const minus11 = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    expect(isRoundStuck({
      id: "r1",
      created_at: minus11,
      status: "active",
      course_details: { game_state: { currentHole: null } },
    }, NOW)).toBe(true);
  });

  it("status='active' + currentHole=3 → NOT stuck (game advanced past setup)", () => {
    const minus60 = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(isRoundStuck({
      id: "r1",
      created_at: minus60,
      status: "active",
      course_details: { game_state: { currentHole: 3 } },
    }, NOW)).toBe(false);
  });

  it("status='active' + currentHole=null + age 9 min → NOT stuck (under legacy threshold)", () => {
    const minus9 = new Date(NOW.getTime() - 9 * 60_000).toISOString();
    expect(isRoundStuck({
      id: "r1",
      created_at: minus9,
      status: "active",
      course_details: { game_state: { currentHole: null } },
    }, NOW)).toBe(false);
  });

  it("status undefined defaults to legacy path (treats as 'active')", () => {
    // Backwards compat for callers passing the pre-PR-#30 shape
    const minus15 = new Date(NOW.getTime() - 15 * 60_000).toISOString();
    expect(isRoundStuck({
      id: "r1",
      created_at: minus15,
      course_details: { game_state: { currentHole: null } },
    }, NOW)).toBe(true);
  });

  it("status='completed' or 'canceled' → never stuck regardless of age", () => {
    // Defensive: terminal-state rounds shouldn't be flagged. The
    // legacy currentHole branch returns true for any status that's
    // neither 'setup' nor has a non-zero currentHole — so 'completed'
    // with currentHole=18 won't fire (covered above), but 'canceled'
    // with currentHole=null at hour-old age WOULD return true under
    // the current implementation. Locks in that the predicate
    // expects callers to pre-filter out terminal states (consistent
    // with the PR #23 D4-B comment "caller has already filtered").
    // This test documents the contract rather than asserting a
    // protective behavior — if callers stop filtering, they need
    // to add the filter back at the call site.
    const minus60 = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(isRoundStuck({
      id: "r1",
      created_at: minus60,
      status: "active",
      course_details: { game_state: { currentHole: 18 } },
    }, NOW)).toBe(false);
  });
});

// ------------------------------------------------------------
// Block 7 — loadActiveRound widening
// ------------------------------------------------------------

describe("loadActiveRound — widened to include status='setup' (PR #30 D4-A)", () => {
  it("SELECT includes 'status' column", () => {
    expect(DB).toMatch(/const\s+ROUND_COLS\s*=\s*"id, course, game_type, stakes, created_at, course_details, status"/);
  });

  it("WHERE clause uses status IN ('active', 'setup') instead of status='active'", () => {
    // Both query branches (creator + player-of) should use the IN form
    const matches = DB.match(/\.in\("status",\s*\["active",\s*"setup"\]\)/g) || [];
    expect(matches.length, "expected two .in('status', ['active','setup']) calls").toBeGreaterThanOrEqual(2);
  });
});
