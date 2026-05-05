import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #55 commit 2 — Non-scorekeeper routing regression.
//
// Bug surfaced during the same on-course Flip round (2026-04-29):
// a player added to the round at setup tapped Resume on the feed
// and got dropped onto the scorekeeper UI (CrybabyActiveRound's
// team-locking / re-flip page) instead of the read-only spectator
// view. Settlement + team mutations are scorekeeper-only — letting
// a non-scorekeeper land on that page is a foot-gun.
//
// Fix has three layers:
//   1. loadActiveRound returns `is_scorekeeper` so callers know.
//   2. CrybabyFeed's Resume button routes participants to /watch.
//   3. CrybabyActiveRound has a mount-time redirect for any non-
//      scorekeeper participant who somehow lands there (deep link,
//      stale tab, etc.).
//
// Source-level guards pin all three layers so a future refactor
// can't silently regress.
// ============================================================

const repoRoot = path.resolve(__dirname, "..", "..");

describe("flip non-scorekeeper routing — PR #55 commit 2", () => {
  it("loadActiveRound returns is_scorekeeper flag", () => {
    const src = fs.readFileSync(
      path.join(repoRoot, "src/lib/db.ts"),
      "utf8",
    );
    // Both branches of loadActiveRound (creator-path + participant-
    // path) must tag the result with is_scorekeeper.
    expect(src).toMatch(/is_scorekeeper:\s*true/);
    expect(src).toMatch(/is_scorekeeper:\s*asPlayer\.created_by\s*===\s*user\.id/);
    // The SELECT must include `created_by` so the participant path
    // can derive the flag without a second round-trip.
    expect(src).toMatch(/ROUND_COLS = "id, course, game_type, stakes, created_at, course_details, status, created_by"/);
  });

  it("CrybabyFeed Resume button branches on is_scorekeeper", () => {
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabyFeed.jsx"),
      "utf8",
    );
    // The onResume must inspect activeRound.is_scorekeeper and
    // route to /watch for non-scorekeepers.
    expect(src).toMatch(/activeRound\.is_scorekeeper/);
    expect(src).toMatch(/\/watch\?id=\$\{activeRound\.id\}/);
    expect(src).toMatch(/\/round\?id=\$\{activeRound\.id\}/);
  });

  it("CrybabyActiveRound has a mount-time spectator-route guard", () => {
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
      "utf8",
    );
    // The guard must:
    //   - Skip while loading
    //   - Skip when there's no current user
    //   - Skip non-participants (admins / spectators)
    //   - Skip scorekeepers (the happy path)
    //   - Redirect everyone else to /watch?id=...
    expect(src).toMatch(/spectator-route guard/);
    expect(src).toMatch(/if \(loading\) return;/);
    expect(src).toMatch(/if \(currentUserPlayerId === null\) return;/);
    expect(src).toMatch(/if \(isScorekeeper\) return;/);
    expect(src).toMatch(/navigate\(`\/watch\?id=\$\{id\}`, \{ replace: true \}\)/);
  });
});
