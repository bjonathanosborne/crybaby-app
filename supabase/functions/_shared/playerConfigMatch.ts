// ============================================================
// playerConfigMatch (edge-function copy) — order-independent
// lookup of a playerConfig entry given a round_players row.
//
// Mirrors src/lib/playerConfigMatch.ts. Kept as a separate file
// because Deno edge functions can't reach into src/. If you
// change one, change the other.
//
// Why this exists: PR #30's D4-A `start_round` RPC inserts all
// round_players rows in a single transaction. Postgres assigns
// every row the same `created_at` timestamp (transaction
// snapshot time). Subsequent reads via `.order("created_at")`
// have no guaranteed tiebreaker, so the rows may come back in
// arbitrary order — which breaks the implicit
// `dbPlayers[i] ↔ playerConfig[i]` array-index alignment the
// edge-function-level player construction relied on.
// ============================================================

interface DbPlayerLike {
  user_id?: string | null;
  guest_name?: string | null;
}

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
 *   1. user_id ↔ userId
 *   2. guest_name ↔ name (when both sides have null userId)
 *   3. positional fallback
 */
export function findPlayerConfig(
  dbPlayer: DbPlayerLike,
  playerConfig: PlayerConfigLike[] | null | undefined,
  fallbackIndex: number,
): PlayerConfigLike {
  if (!playerConfig || playerConfig.length === 0) return {};

  if (dbPlayer.user_id) {
    const byUserId = playerConfig.find(c => c?.userId === dbPlayer.user_id);
    if (byUserId) return byUserId;
  }

  if (!dbPlayer.user_id && dbPlayer.guest_name) {
    const byName = playerConfig.find(
      c => !c?.userId && c?.name === dbPlayer.guest_name,
    );
    if (byName) return byName;
  }

  return playerConfig[fallbackIndex] || {};
}
