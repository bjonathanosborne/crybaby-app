import { useCallback } from "react";
import { computeAdvanceHole, type RoundStateSnapshot } from "@/hooks/useRoundState";
import type { UseRoundStateReturn } from "@/hooks/useRoundState";
import type {
  PersistResult,
  UseRoundPersistenceReturn,
  GameStateSnapshot,
} from "@/hooks/useRoundPersistence";
// PR #28: CaptureCadence import removed — the cadence-blocked branch
// no longer exists in this hook. captureCadence.ts module itself stays
// in place (still used by the extract-scores edge function).
import {
  advanceFlipState,
  appendPushToWindow,
  claimRollingCarryWindow,
  initRollingCarryWindow,
  type HoleResult,
  type Player,
  type TeamInfo,
} from "@/lib/gameEngines";

// ============================================================================
// useAdvanceHole — composite hook that sequences
//   compute (pure) -> persist scores -> persist game state
// into a single awaitable operation. The component calls
// `advanceHole(result)` and gets a typed Result back.
//
// PR #28: Capture gate removed. Originally Phase-2 specific: if cadence
// demanded a photo for the just-completed hole and no capture had been
// applied yet, advance rejected with `CaptureRequiredError`. PR #27
// stripped the page-level wiring (CapturePrompt banner + the
// captureApplied flag plumbing); PR #28 finishes the rip-out by removing
// the gate from this hook too. With no live caller, the gate only
// documented a UX contract that no longer exists. Removing it removes
// the temptation for future PRs to re-wire without re-adding the UI.
//
// AdvanceResult now has a single failure mode: PersistFailureError.
// ============================================================================

/** Discriminated result of a single advanceHole call. */
export type AdvanceResult =
  | { ok: true; snapshot: RoundStateSnapshot }
  | { ok: false; error: PersistFailureError };

/**
 * Wrapper that lifts a PersistResult's error into a structured failure.
 * Kept separate from CaptureRequiredError so the UI can disambiguate.
 */
export class PersistFailureError extends Error {
  readonly kind = "persist_failure" as const;
  readonly failures: readonly PersistFailureDetail[];
  constructor(failures: readonly PersistFailureDetail[]) {
    super(
      failures.length === 1
        ? `Persist failed: ${failures[0].step} (${failures[0].cause.kind})`
        : `Persist failed at ${failures.length} steps`,
    );
    this.name = "PersistFailureError";
    this.failures = failures;
  }
}

export interface PersistFailureDetail {
  step: "player_scores" | "game_state" | "round_event";
  cause: { kind: string; message: string };
}

// ============================================================================
// Inputs
// ============================================================================

/**
 * What the hook needs to advance a hole. Deliberately narrow so tests can
 * call `computeAdvanceHole`-via-this-hook without mocking a full page.
 */
export interface UseAdvanceHoleArgs {
  roundId: string | null;
  gameMode: string;
  players: Player[];
  holeValue: number;
  /** Teams in play for the current hole (already resolved by the page). */
  teams: TeamInfo | null;
  /** Nassau 2v2 split (null for individual / non-Nassau). */
  nassauTeams: TeamInfo | null;
  /** Round state (from useRoundState). Read for current hole + scores. */
  state: UseRoundStateReturn;
  /** Persistence layer (from useRoundPersistence). */
  persist: UseRoundPersistenceReturn;
  // PR #28: cadence + captureApplied + cadenceReason removed along with
  // the capture gate. The hook no longer takes any photo-related input.
}

// ============================================================================
// Hook
// ============================================================================

export interface UseAdvanceHoleReturn {
  /**
   * Apply this hole's result: compute next state, persist player scores and
   * game-state snapshot in parallel, return the next snapshot on success.
   */
  advanceHole: (result: HoleResult) => Promise<AdvanceResult>;
}

export function useAdvanceHole(args: UseAdvanceHoleArgs): UseAdvanceHoleReturn {
  const { roundId, gameMode, players, holeValue, teams, nassauTeams, state, persist } = args;

  const advanceHole = useCallback(async (result: HoleResult): Promise<AdvanceResult> => {
    // PR #28: pre-persistence capture gate removed. Photo capture is no
    // longer a UX surface; advance has no pre-persistence rejection mode
    // beyond the persist failures handled below.

    // Compute next state (pure).
    const prev: RoundStateSnapshot = state.getSnapshot();
    const nextSnapshot = computeAdvanceHole(prev, {
      result,
      currentHole: state.currentHole,
      gameMode,
      players,
      holeValue,
      teams,
      nassauTeams,
    });

    // Flip: compute next FlipState + RollingCarryWindow transitions here
    // (outside the `if (roundId)` block) so they can be committed to React
    // state even on non-persistent (guest / no-round-id) flows.
    let nextFlipState = prev.flipState;
    let nextRollingCarryWindow = prev.rollingCarryWindow;
    if (gameMode === 'flip' && state.currentHole <= 15) {
      nextFlipState = advanceFlipState(prev.flipState, state.currentHole, !!result.push, players);
      const existingWindow = prev.rollingCarryWindow
        ?? initRollingCarryWindow(prev.flipConfig?.carryOverWindow ?? 'all');
      if (result.push) {
        const baseBet = prev.flipConfig?.baseBet ?? holeValue;
        const potThisHole = baseBet * players.length;
        nextRollingCarryWindow = appendPushToWindow(existingWindow, state.currentHole, potThisHole);
      } else {
        nextRollingCarryWindow = claimRollingCarryWindow(existingWindow).cleared;
      }
    }

    // 3. Persist: player scores (per player) + round game-state snapshot,
    //    in parallel. Each player's scores are written separately to match
    //    the existing db.ts signature.
    const persistOps: Promise<{
      step: PersistFailureDetail["step"];
      result: PersistResult<void>;
    }>[] = [];

    if (roundId) {
      // Per-player scores: extract the full hole_scores map (hole -> gross)
      for (const p of players) {
        const holeScores: Record<number, number> = {};
        for (const [holeStr, byPlayer] of Object.entries(nextSnapshot.scores)) {
          const grossByPlayer = byPlayer as Record<string, number>;
          const hole = Number(holeStr);
          if (grossByPlayer[p.id] != null) holeScores[hole] = grossByPlayer[p.id];
        }
        persistOps.push(
          persist
            .persistPlayerScores(p.id, holeScores, nextSnapshot.totals[p.id] ?? 0)
            .then(result => ({ step: "player_scores" as const, result })),
        );
      }

      const gameStateSnapshot: GameStateSnapshot = {
        currentHole: nextSnapshot.currentHole,
        carryOver: nextSnapshot.carryOver,
        totals: nextSnapshot.totals,
        hammerHistory: nextSnapshot.hammerHistory,
        flipState: nextFlipState,
        flipConfig: prev.flipConfig ?? undefined,
        rollingCarryWindow: nextRollingCarryWindow ?? undefined,
      };
      persistOps.push(
        persist
          .persistGameState(roundId, gameStateSnapshot)
          .then(result => ({ step: "game_state" as const, result })),
      );
    }

    const persistSettled = await Promise.all(persistOps);
    const failures: PersistFailureDetail[] = [];
    for (const s of persistSettled) {
      if (!s.result.ok) {
        failures.push({
          step: s.step,
          cause: { kind: s.result.error.kind, message: s.result.error.message },
        });
      }
    }

    if (failures.length > 0) {
      return { ok: false, error: new PersistFailureError(failures) };
    }

    // 4. Commit to React state only after persistence succeeded. This keeps
    //    the in-memory state eventually-consistent with the DB even if a
    //    component re-render races with a failed write.
    state.setTotals(nextSnapshot.totals);
    state.setHoleResults(nextSnapshot.holeResults);
    state.setCarryOver(nextSnapshot.carryOver);
    state.setHammerHistory(nextSnapshot.hammerHistory);
    state.setHammerDepth(0);
    state.setHammerPending(false);
    state.setLastHammerBy(null);
    state.setNassauState(nextSnapshot.nassauState);
    // Flip: commit the per-hole team + rolling-window transitions. No-op
    // for non-Flip rounds (nextFlipState === prev.flipState, same for the
    // window) so the setter runs with identical input — React short-circuits.
    state.setFlipState(nextFlipState);
    state.setRollingCarryWindow(nextRollingCarryWindow);
    state.setCurrentHole(nextSnapshot.currentHole);

    return { ok: true, snapshot: { ...nextSnapshot, flipState: nextFlipState, rollingCarryWindow: nextRollingCarryWindow } };
  }, [
    state, gameMode, players, holeValue, teams, nassauTeams,
    roundId, persist,
  ]);

  return { advanceHole };
}
