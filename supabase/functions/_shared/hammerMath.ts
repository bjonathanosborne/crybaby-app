// ============================================================
// Pure math for resolving hammer state on a single hole.
//
// Used by:
//  - `apply-capture` edge function (server-side money truth)
//  - the client's hammer prompt UI (to show the scorekeeper the
//    outcome before they submit)
//  - tests (every terminal case locked down)
//
// Zero React, zero DB. Just types in, verdict out.
// ============================================================

import type {
  HoleHammerState,
  HammerOutcome,
  LegacyHammerEntry,
} from "./hammerTypes.ts";

// ----------------------------------------------------------------
// resolveHammerOutcome — the canonical winner+multiplier function.
// ----------------------------------------------------------------

/**
 * Given a HoleHammerState, compute winner + multiplier.
 *
 * Rules (must match existing gameEngines behavior):
 *   - No hammers: winner by score, 1×.
 *   - Scored out at depth D (all events accepted, responder at last
 *     depth chose not to hammer back): winner by score, 2^D.
 *   - Laid down at depth D: thrower at D wins regardless of scores,
 *     2^(D-1). (Scores after lay-down don't affect the outcome.)
 *
 * Caller checks `winner`:
 *   - "A" or "B": that team won outright (from a lay-down).
 *   - "by_score": caller resolves via normal team-best-ball logic at
 *     the returned multiplier.
 */
export function resolveHammerOutcome(state: HoleHammerState): HammerOutcome {
  // No hammers → standard stroke-play hole.
  if (state.events.length === 0) {
    return { winner: "by_score", multiplier: 1, source: "no_hammer" };
  }

  const last = state.events[state.events.length - 1];

  if (last.response === "laid_down") {
    // Thrower at the final depth wins; multiplier frozen at 2^(D-1).
    return {
      winner: last.thrower,
      multiplier: Math.pow(2, last.depth - 1),
      source: "laid_down",
      laidDownAtDepth: last.depth,
    };
  }

  // All events accepted. Must be scored out — winner by score at 2^D.
  // (If scoredOut is false here, validateHammerState will catch it.)
  return {
    winner: "by_score",
    multiplier: Math.pow(2, last.depth),
    source: "scored_out",
    scoredOutAtDepth: last.depth,
  };
}

// ----------------------------------------------------------------
// validateHammerState — catches malformed sequences before apply.
// ----------------------------------------------------------------

/**
 * Validate invariants the UI should enforce but we double-check here
 * before persisting money math:
 *  - depths are 1-indexed with no gaps (1, 2, 3, ...)
 *  - throwers alternate (A, B, A, B, ... starting from either)
 *  - no events after a "laid_down" response
 *  - scoredOut = true ⇒ last event is "accepted"
 *  - scoredOut = false with events ⇒ last event is "laid_down"
 *  - empty events ⇒ scoredOut = false
 */
export function validateHammerState(
  state: HoleHammerState,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const { events, scoredOut } = state;

  // Empty events case
  if (events.length === 0) {
    if (scoredOut) errors.push("scoredOut must be false when no events exist");
    return { ok: errors.length === 0, errors };
  }

  // Depth sequencing + thrower alternation
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const expectedDepth = i + 1;
    if (e.depth !== expectedDepth) {
      errors.push(`event[${i}]: expected depth ${expectedDepth}, got ${e.depth}`);
    }
    if (i > 0) {
      const prev = events[i - 1];
      if (e.thrower === prev.thrower) {
        errors.push(
          `event[${i}]: thrower must alternate (prev was ${prev.thrower}, got ${e.thrower} at depth ${e.depth})`,
        );
      }
      // Must have been accepted at the previous depth for a hammer-back to happen
      if (prev.response === "laid_down") {
        errors.push(`event[${i}]: cannot have further events after a laid_down at depth ${prev.depth}`);
      }
    }
  }

  // Terminal-state consistency
  const last = events[events.length - 1];
  if (last.response === "laid_down" && scoredOut) {
    errors.push("scoredOut=true is incompatible with a laid_down final event");
  }
  if (last.response === "accepted" && !scoredOut) {
    errors.push(
      "scoredOut must be true when the final event is accepted (otherwise the sequence is incomplete)",
    );
  }

  return { ok: errors.length === 0, errors };
}

// ----------------------------------------------------------------
// translateToLegacy — new rich shape → existing engine shape.
// ----------------------------------------------------------------

/**
 * Convert a HoleHammerState to the `{hammerDepth, folded, foldWinnerTeamId?}`
 * shape the engine's replayRound consumes. This is how the capture pipeline
 * hands the engine what it needs without refactoring the engine.
 *
 * Mapping (verified against gameEngines multiplier math
 * `Math.pow(2, hammerDepth)`):
 *
 *   no hammer    : hammerDepth=0, folded=false
 *   scored out D : hammerDepth=D, folded=false              (2^D multiplier)
 *   laid down D  : hammerDepth=D-1, folded=true, winner=A/B (2^(D-1) multiplier)
 *
 * Pass `hole` so the caller gets a LegacyHammerEntry ready to drop into
 * course_details.game_state.hammerHistory.
 */
export function translateToLegacy(
  hole: number,
  state: HoleHammerState,
): LegacyHammerEntry {
  const outcome = resolveHammerOutcome(state);
  switch (outcome.source) {
    case "no_hammer":
      return { hole, hammerDepth: 0, folded: false };
    case "scored_out":
      return { hole, hammerDepth: outcome.scoredOutAtDepth, folded: false };
    case "laid_down":
      return {
        hole,
        hammerDepth: outcome.laidDownAtDepth - 1,
        folded: true,
        foldWinnerTeamId: outcome.winner,
      };
  }
}
