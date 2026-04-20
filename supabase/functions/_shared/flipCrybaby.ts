// ============================================================
// Flip settlement split — Deno/edge-function copy of the
// settlement-split half of src/lib/flipCrybaby.ts. Only the
// pieces needed by apply-capture are ported; identification /
// hammer-gate helpers stay client-side.
//
// Invariant (Flip): amount = baseAmount + crybabyAmount.
// Non-Flip rounds never call this.
// ============================================================

import type { GameMode, HoleResult } from "./gameEngines.ts";

export interface FlipSettlementSplit {
  baseAmount: number;
  crybabyAmount: number;
}

/**
 * Split a per-player settlement into base-game (1-15) and crybaby (16-18)
 * halves by summing the `playerResults[].amount` entries on each hole.
 *
 * When `crybabyWasPlayed` is false (all-square sentinel: crybaby === ""),
 * ALL played holes — including 16-18 — sum into `baseAmount`, and
 * `crybabyAmount` is explicitly 0 (not null). This matches the client
 * semantics in src/lib/flipCrybaby.ts.
 */
export function computeFlipSettlementSplit(
  holeResults: (HoleResult & { hole: number })[],
  playerId: string,
  crybabyWasPlayed: boolean,
): FlipSettlementSplit {
  if (!crybabyWasPlayed) {
    let base = 0;
    for (const hr of holeResults) {
      const pr = hr.playerResults.find((p) => p.id === playerId);
      if (pr) base += pr.amount;
    }
    return { baseAmount: base, crybabyAmount: 0 };
  }

  let base = 0;
  let crybaby = 0;
  for (const hr of holeResults) {
    const pr = hr.playerResults.find((p) => p.id === playerId);
    if (!pr) continue;
    if (hr.hole <= 15) base += pr.amount;
    else crybaby += pr.amount;
  }
  return { baseAmount: base, crybabyAmount: crybaby };
}

export function roundHasFlipSettlementSplit(gameMode: GameMode): boolean {
  return gameMode === "flip";
}
