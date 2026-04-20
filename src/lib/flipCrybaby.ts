// ============================================================
// Flip crybaby-phase helpers — pure primitives.
//
// These functions bridge the base game (holes 1-15) to the
// crybaby sub-game (holes 16-18). All inputs and outputs are
// plain data — no React, no DB, no side effects — so they're
// testable in isolation and reusable from any caller (the
// transition UI, the apply-capture replay path, and future
// audit tooling).
//
// Rules (locked in by PR #16 discussion):
//   - Crybaby = player with the most-negative hole-15 balance.
//   - Ties resolved deterministically via a seed derived from
//     round.id (so a replay / audit always picks the same winner).
//   - maxBetPerHole = floor(|losingBalance| / 2) rounded DOWN to
//     the nearest even dollar. Computed ONCE at hole 15; never
//     adjusted during crybaby play.
//   - Minimum cap is $2 (the even-bet floor); any tiny loss that
//     would round to $0 gets lifted to $2.
//   - If nobody is in the hole at hole 15 (everyone >= 0), the
//     crybaby concept doesn't apply. Caller handles the fallback.
// ============================================================

import type { HoleResult, Player } from "@/lib/gameEngines";

export interface CrybabyIdentification {
  /** Player id of the crybaby, or null if no one is in the hole. */
  crybaby: string | null;
  /** Absolute dollar value of the crybaby's loss (positive number). 0 if no crybaby. */
  losingBalance: number;
  /** 50%-rounded-to-even cap, pre-computed at hole 15. Min $2. 0 if no crybaby. */
  maxBetPerHole: number;
  /**
   * Audit record of the tiebreaker, if one ran. Undefined when the crybaby
   * was unambiguous (a single most-negative player).
   */
  tiebreakOutcome?: {
    tied: string[];
    winner: string;
    seedSource: string;
  };
  /** Per-player balance map used to pick the crybaby (useful for UI display). */
  balances: Record<string, number>;
}

/**
 * Sum each player's cumulative base-game balance from a list of hole
 * results. Designed to reconstruct balances from source-of-truth hole
 * data — so audit tooling / replay paths never trust `totals` alone.
 *
 * `scope` limits which holes are summed. Typically "base" (1-15) for
 * the crybaby handoff, but pass "all" for full-round math.
 */
export function computeBaseGameBalances(
  holeResults: (HoleResult & { hole: number })[],
  players: Player[],
  scope: "base" | "all" = "base",
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const p of players) balances[p.id] = 0;

  for (const hr of holeResults) {
    if (scope === "base" && hr.hole > 15) continue;
    for (const pr of hr.playerResults) {
      balances[pr.id] = (balances[pr.id] || 0) + pr.amount;
    }
  }
  return balances;
}

/**
 * Deterministic string → number hash (djb2 variant). Produces a
 * non-negative int from any string. Used to seed the tiebreaker so
 * audit replay is reproducible.
 */
export function seededHash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick one item from a sorted list deterministically given a seed
 * source. Sorting the input first guarantees that the SAME tied set
 * always produces the SAME winner regardless of input order — e.g.
 * ["p3","p1"] and ["p1","p3"] with the same seed pick the same player.
 */
export function seededPick<T>(seed: string, items: readonly T[], key: (x: T) => string): T {
  if (items.length === 0) throw new Error("seededPick: empty input");
  if (items.length === 1) return items[0];
  const sorted = [...items].sort((a, b) => key(a).localeCompare(key(b)));
  const idx = seededHash(seed) % sorted.length;
  return sorted[idx];
}

/**
 * Round a positive loss to the nearest even dollar AT OR BELOW half
 * the loss. Examples:
 *    $60 → floor(30 / 2) * 2 = $30
 *    $23 → floor(11.5 / 2) * 2 = $10
 *    $1  → floor(0.5 / 2) * 2 = $0, lifted to $2 (even-bet floor)
 *    $0  → $0 (caller uses this to know crybaby doesn't apply)
 */
export function computeMaxBetPerHole(losingBalance: number): number {
  if (losingBalance <= 0) return 0;
  const halfLoss = losingBalance / 2;
  const evenRounded = Math.floor(halfLoss / 2) * 2;
  return Math.max(2, evenRounded);
}

/**
 * Identify the crybaby from a balances map + resolve ties with the
 * seeded tiebreaker. `roundId` is the canonical seed source; pass it
 * verbatim from `rounds.id`. Returns `{ crybaby: null, ... }` when
 * no one is in the hole (all balances >= 0).
 */
export function identifyCrybaby(
  balances: Record<string, number>,
  roundId: string,
): CrybabyIdentification {
  const entries = Object.entries(balances);
  if (entries.length === 0) {
    return { crybaby: null, losingBalance: 0, maxBetPerHole: 0, balances };
  }

  let lowest = Infinity;
  for (const [, v] of entries) if (v < lowest) lowest = v;

  // No one is in the hole — crybaby concept doesn't apply.
  if (lowest >= 0) {
    return { crybaby: null, losingBalance: 0, maxBetPerHole: 0, balances };
  }

  const tied = entries.filter(([, v]) => v === lowest).map(([id]) => id);
  const losingBalance = Math.abs(lowest);
  const maxBetPerHole = computeMaxBetPerHole(losingBalance);

  if (tied.length === 1) {
    return {
      crybaby: tied[0],
      losingBalance,
      maxBetPerHole,
      balances,
    };
  }

  // Tiebreaker: seeded pick over the tied set.
  const winner = seededPick(roundId, tied, (x) => x);
  return {
    crybaby: winner,
    losingBalance,
    maxBetPerHole,
    tiebreakOutcome: {
      tied: [...tied].sort(),
      winner,
      seedSource: roundId,
    },
    balances,
  };
}

// ============================================================
// Crybaby hammer-initiator gate (C6.1).
//
// Rule: during crybaby phase (Flip holes 16-18 when a crybaby is
// designated), only the 2-man team (crybaby + partner) can THROW
// a depth-0 hammer. Hammer-BACKs at depth >= 1 stay unchanged —
// the engine's alternation rule handles those naturally.
//
// This is a UI-only gate. The hammer engine still accepts any
// initiator; we just prevent the app from presenting the
// option to the wrong team.
//
// `currentUserPlayerId` is the scorekeeper's `round_players.id`
// (NOT their auth user_id). Callers resolve this via
// `dbPlayers.find(p => p.user_id === currentUser?.id)?.id`.
//
// Returns `true` (allow) in every non-crybaby scenario so the
// base-game hammer button works exactly as it did pre-C6.1.
// ============================================================

export interface HammerInitiatorGateArgs {
  gameMode: string;
  currentHole: number;
  crybabyState: {
    crybaby: string;
    byHole: Record<number, { partner: string }>;
  } | null;
  /** round_players.id of the current user (scorekeeper), or null if not a player. */
  currentUserPlayerId: string | null;
}

export function canInitiateCrybabyHammer(args: HammerInitiatorGateArgs): boolean {
  const { gameMode, currentHole, crybabyState, currentUserPlayerId } = args;

  // Outside crybaby phase: no gate, button always available.
  const inCrybabyHoleRange = currentHole >= 16 && currentHole <= 18;
  const inFlipCrybaby = gameMode === "flip"
    && inCrybabyHoleRange
    && crybabyState !== null
    && crybabyState.crybaby !== "";

  if (!inFlipCrybaby) return true;

  // Crybaby phase but the scorekeeper hasn't confirmed the per-hole
  // setup yet. Hammer isn't in play until after setup + scoring begins,
  // so returning true here is safe — the button's own gating on
  // `!allScored && settings.hammer && teams` keeps it hidden anyway.
  const hole = crybabyState!.byHole[currentHole];
  if (!hole) return true;

  // No resolved player id means the current user isn't on the round
  // (spectator, admin, etc.). Gate closes — only the 2-man team
  // initiates, and non-players aren't on any team.
  if (!currentUserPlayerId) return false;

  // Allow only when the scorekeeper IS the crybaby OR the chosen
  // partner for this hole.
  return currentUserPlayerId === crybabyState!.crybaby
    || currentUserPlayerId === hole.partner;
}
