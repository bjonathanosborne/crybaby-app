// ============================================================
// Hammer capture types — shared between client and edge functions.
//
// Captures the FULL sequence of throws/responses per hole. The existing
// engine (gameEngines.ts) stores a "compressed" shape per hole
// ({hammerDepth, folded, foldWinnerTeamId?}) that's enough to settle the
// money but doesn't preserve who threw at each depth. This rich shape
// sits on capture rows for audit + UI display; hammerMath.translateToLegacy
// converts to the engine's shape at apply time.
// ============================================================

export type HammerDepthEvent = {
  /** 1-indexed depth. Depth 1 is the initial throw; depth 2 is a hammer-back, etc. */
  depth: number;
  /** Which team THREW at this depth. Alternates A/B on each hammer-back. */
  thrower: "A" | "B";
  /** What the OPPONENT did in response to this throw. */
  response: "accepted" | "laid_down";
};

export type HoleHammerState = {
  events: HammerDepthEvent[];
  /**
   * Terminal flag. True iff all events ended in "accepted" AND the
   * responder at the last depth chose NOT to hammer back (they scored
   * the hole out at the current multiplier). False if:
   *  - no hammers on the hole (events: []), OR
   *  - a lay-down happened (last event's response is "laid_down").
   */
  scoredOut: boolean;
};

export type CaptureHammerState = {
  /** Per-hole hammer state keyed by hole number (1..18). */
  byHole: Record<number, HoleHammerState>;
};

/**
 * Outcome of resolving a HoleHammerState: who won, at what multiplier,
 * and what path we took to get there.
 *
 * `winner === 'by_score'` means the caller must compute the score-based
 * winner (lowest net in team match-play); otherwise `winner` is the
 * team that won by lay-down.
 */
export type HammerOutcome =
  | {
      winner: "A" | "B";
      multiplier: number;
      source: "laid_down";
      laidDownAtDepth: number;
    }
  | {
      winner: "by_score";
      multiplier: number;
      source: "scored_out";
      scoredOutAtDepth: number;
    }
  | {
      winner: "by_score";
      multiplier: 1;
      source: "no_hammer";
    };

/**
 * Shape the engine currently consumes from
 * `course_details.game_state.hammerHistory`. One entry per played hole.
 * `hammerMath.translateToLegacy` produces this from a HoleHammerState.
 */
export type LegacyHammerEntry = {
  hole: number;
  hammerDepth: number;
  folded: boolean;
  foldWinnerTeamId?: "A" | "B";
};
