// ============================================================
// playerConfigMatch — order-independent lookup of a playerConfig
// entry given a round_players row.
//
// Why this exists: PR #30's D4-A `start_round` RPC inserts all
// round_players rows in a single transaction. Postgres assigns
// every row the same `created_at` timestamp (transaction
// snapshot time). Subsequent reads via `.order("created_at")`
// have no guaranteed tiebreaker, so the rows may come back in
// arbitrary order — which breaks the implicit
// `dbPlayers[i] ↔ playerConfig[i]` array-index alignment the
// page-level player construction relied on.
//
// Symptom: Jonathan's on-course DOC round at Westlake on
// 2026-04-30 — Michael (handicap 6) showed strokes on hole 1,
// Jonathan (handicap 11) showed none. Their config entries had
// crossed wires because the array indices no longer matched.
//
// Fix: match by `user_id` first (every signed-in player has one
// in both shapes), then by guest_name (for guest players whose
// user_id is null on both sides), then fall back to positional
// index (for legacy rounds where playerConfig entries don't
// carry a userId field).
//
// This module deliberately stays small + dependency-free so the
// active-round path can import it without dragging the engine
// type system along.
// ============================================================

/**
 * Minimal shape needed from a round_players row.
 */
interface DbPlayerLike {
  user_id?: string | null;
  guest_name?: string | null;
}

/**
 * Minimal shape needed from a course_details.playerConfig entry.
 * Tolerant `unknown` types because legacy rounds may have any
 * combination of keys (the wizard's exact shape has shifted across
 * PRs #17, #23, #30; this helper can't depend on a current snapshot).
 */
export interface PlayerConfigLike {
  userId?: string | null;
  name?: string;
  [key: string]: unknown;
}

/**
 * Find the playerConfig entry that corresponds to a given
 * round_players row. Order-independent.
 *
 * Match priority:
 *   1. user_id ↔ userId  (signed-in players; primary key for the join)
 *   2. guest_name ↔ name (guests; both sides have null userId)
 *   3. positional fallback (legacy rounds where playerConfig was
 *      written without a userId field — pre-PR-#23 shape)
 *
 * Returns an empty object when no match found, matching the
 * previous `playerConfig?.[i] || {}` semantic so callers don't
 * need to special-case nulls.
 */
export function findPlayerConfig(
  dbPlayer: DbPlayerLike,
  playerConfig: PlayerConfigLike[] | null | undefined,
  fallbackIndex: number,
): PlayerConfigLike {
  if (!playerConfig || playerConfig.length === 0) return {};

  // 1. Match by user_id (the canonical key for signed-in players).
  if (dbPlayer.user_id) {
    const byUserId = playerConfig.find(c => c?.userId === dbPlayer.user_id);
    if (byUserId) return byUserId;
  }

  // 2. Match by guest_name when both sides have null userId.
  //    Guard the predicate so we don't accidentally match a guest
  //    config to a signed-in player whose name happens to collide
  //    with the guest's name.
  if (!dbPlayer.user_id && dbPlayer.guest_name) {
    const byName = playerConfig.find(
      c => !c?.userId && c?.name === dbPlayer.guest_name,
    );
    if (byName) return byName;
  }

  // 3. Positional fallback for legacy rounds. Any playerConfig
  //    entry written without a userId field is from before PR #17
  //    or from a guest-heavy round; assume the writer kept the
  //    indexes aligned at insertion time.
  return playerConfig[fallbackIndex] || {};
}
