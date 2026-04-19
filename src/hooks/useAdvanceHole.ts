import { useCallback, useMemo } from "react";
import { computeAdvanceHole, type RoundStateSnapshot } from "@/hooks/useRoundState";
import type { UseRoundStateReturn } from "@/hooks/useRoundState";
import type {
  PersistResult,
  UseRoundPersistenceReturn,
  GameStateSnapshot,
} from "@/hooks/useRoundPersistence";
import type { CaptureCadence } from "@/lib/captureCadence";
import type { HoleResult, Player, TeamInfo } from "@/lib/gameEngines";

// ============================================================================
// useAdvanceHole — composite hook that sequences
//   compute (pure) -> persist scores -> persist game state -> capture gate
// into a single awaitable operation. The component calls
// `advanceHole(result)` and gets a typed Result back.
//
// The capture gate is what makes this Phase-2 specific: if cadence demands
// a photo for the hole just completed and no capture has been applied yet,
// advance rejects with `CaptureRequiredError` instead of advancing. The UI
// surfaces the error with the CapturePrompt banner; it does NOT silently
// advance or silently swallow the error.
// ============================================================================

/**
 * Thrown from `advanceHole` when cadence requires a photo that hasn't been
 * applied yet. Never use for any other failure mode — the UI dispatches on
 * this exact class to decide whether to show the CapturePrompt banner vs.
 * a generic error toast.
 */
export class CaptureRequiredError extends Error {
  readonly kind = "capture_required" as const;
  readonly hole: number;
  readonly reason: string | null;
  constructor(hole: number, reason: string | null) {
    super(`Capture required before advancing past hole ${hole}`);
    this.name = "CaptureRequiredError";
    this.hole = hole;
    this.reason = reason;
  }
}

/** Discriminated result of a single advanceHole call. */
export type AdvanceResult =
  | { ok: true; snapshot: RoundStateSnapshot }
  | { ok: false; error: CaptureRequiredError }
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
  /** Cadence for the just-completed hole (from useCaptureCadence). */
  cadence: CaptureCadence;
  /**
   * True when a capture has been applied for the current `justCompletedHole`.
   * When cadence says a photo is required and this is false, advance rejects
   * with CaptureRequiredError.
   */
  captureApplied: boolean;
  /** Reason string for the CapturePrompt banner. */
  cadenceReason: string | null;
}

// ============================================================================
// Hook
// ============================================================================

export interface UseAdvanceHoleReturn {
  /**
   * Apply this hole's result: compute next state, persist player scores and
   * game-state snapshot in parallel, check capture gate, return the next
   * snapshot on success.
   */
  advanceHole: (result: HoleResult) => Promise<AdvanceResult>;
  /**
   * Convenience: is advance currently gated by a required-but-not-applied
   * capture? The page uses this to render the CapturePrompt banner and
   * disable the Next-hole button.
   */
  isBlockedOnPhoto: boolean;
}

export function useAdvanceHole(args: UseAdvanceHoleArgs): UseAdvanceHoleReturn {
  const { roundId, gameMode, players, holeValue, teams, nassauTeams, state, persist, cadence, captureApplied, cadenceReason } = args;

  const isRequired = useMemo<boolean>(() => {
    const currentHole = state.currentHole;
    switch (cadence.type) {
      case "every_hole":
        return currentHole >= 1 && currentHole <= 18;
      case "holes":
        return cadence.holes.includes(currentHole);
      case "none":
        return false;
    }
  }, [cadence, state.currentHole]);

  const isBlockedOnPhoto = isRequired && !captureApplied;

  const advanceHole = useCallback(async (result: HoleResult): Promise<AdvanceResult> => {
    // 1. Capture gate — check FIRST, before any persistence work, so we don't
    //    partially commit and then reject. If blocked, surface
    //    CaptureRequiredError without mutating state.
    if (isBlockedOnPhoto) {
      return {
        ok: false,
        error: new CaptureRequiredError(state.currentHole, cadenceReason),
      };
    }

    // 2. Compute next state (pure).
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
    state.setCurrentHole(nextSnapshot.currentHole);

    return { ok: true, snapshot: nextSnapshot };
  }, [
    isBlockedOnPhoto, state, gameMode, players, holeValue, teams, nassauTeams,
    roundId, persist, cadenceReason,
  ]);

  return { advanceHole, isBlockedOnPhoto };
}
