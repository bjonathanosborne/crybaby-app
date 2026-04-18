import { useCallback, useEffect, useState } from "react";
import {
  updatePlayerScores,
  saveGameState,
  createRoundEvent,
  completeRound,
  insertSettlements,
  cancelRound,
  toggleBroadcast,
} from "@/lib/db";

// ============================================================================
// Typed Result envelope for persistence operations
//
// Happy path never throws. Errors are values, not exceptions. Callers pattern-
// match on `ok` to branch between success and failure. The `kind` narrows the
// UI's recovery path:
//   network     — transient; show retry
//   conflict    — row was changed out from under us; reload + retry
//   auth        — JWT expired or RLS rejected; redirect to /auth
//   unknown     — unexpected; log + show generic error
// ============================================================================

export type PersistErrorKind = "network" | "conflict" | "auth" | "unknown";

export interface PersistError {
  kind: PersistErrorKind;
  message: string;
  cause: unknown;
}

export type PersistResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: PersistError };

/** Narrow an arbitrary thrown value into a PersistError. */
function classifyError(err: unknown): PersistError {
  const message = err instanceof Error ? err.message : String(err);
  const maybeCoded = err as { code?: string; status?: number } | undefined;
  const code = maybeCoded?.code ?? maybeCoded?.status;

  if (code === "PGRST301" || code === 401 || /jwt|unauthor/i.test(message)) {
    return { kind: "auth", message, cause: err };
  }
  // Postgres serialization / concurrent-update failures
  if (code === "23505" || code === "40001" || /conflict|version/i.test(message)) {
    return { kind: "conflict", message, cause: err };
  }
  if (/network|fetch|timeout|offline|abort/i.test(message)) {
    return { kind: "network", message, cause: err };
  }
  return { kind: "unknown", message, cause: err };
}

/** Run a promise-returning fn and wrap the outcome as a PersistResult. */
async function run<T>(fn: () => Promise<T>): Promise<PersistResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: classifyError(err) };
  }
}

// ============================================================================
// Typed payloads (strict — no `any` past the component boundary)
// ============================================================================

export interface GameStateSnapshot {
  currentHole: number;
  carryOver: number;
  totals: Record<string, number>;
  hammerHistory?: unknown[];
}

export interface RoundEventInput {
  roundId: string;
  roundPlayerId?: string | null;
  holeNumber: number;
  grossScore?: number | null;
  par?: number | null;
  eventType: string;
  eventData?: Record<string, unknown>;
}

export interface SettlementRow {
  userId?: string | null;
  guestName?: string | null;
  amount: number;
}

// ============================================================================
// Hook
// ============================================================================

export interface UseRoundPersistenceReturn {
  // Network state
  isOnline: boolean;
  lastSaveFailed: boolean;
  pendingSync: number;
  setPendingSync: React.Dispatch<React.SetStateAction<number>>;

  // Promise-returning, Result-wrapped writes (new contract per 2f spec)
  persistPlayerScores: (
    playerId: string,
    scoresByHole: Record<number, number>,
    totalScore: number,
  ) => Promise<PersistResult<void>>;

  persistGameState: (
    roundId: string,
    state: GameStateSnapshot,
  ) => Promise<PersistResult<void>>;

  persistRoundEvent: (event: RoundEventInput) => Promise<PersistResult<void>>;

  persistRoundCompletion: (roundId: string) => Promise<PersistResult<void>>;

  persistSettlements: (
    roundId: string,
    settlements: SettlementRow[],
  ) => Promise<PersistResult<void>>;

  persistCancel: (roundId: string) => Promise<PersistResult<void>>;

  persistBroadcast: (roundId: string, enabled: boolean) => Promise<PersistResult<void>>;
}

export function useRoundPersistence(): UseRoundPersistenceReturn {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [lastSaveFailed, setLastSaveFailed] = useState<boolean>(false);
  const [pendingSync, setPendingSync] = useState<number>(0);

  // Wire online/offline event listeners once per hook instance.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setPendingSync(0);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const persistPlayerScores = useCallback<UseRoundPersistenceReturn["persistPlayerScores"]>(
    async (playerId, scoresByHole, totalScore) => {
      setPendingSync(n => n + 1);
      const result = await run<void>(async () => {
        await updatePlayerScores(playerId, scoresByHole, totalScore);
      });
      setPendingSync(n => Math.max(0, n - 1));
      if (!result.ok) {
        console.error("[persistence] updatePlayerScores failed", {
          playerId,
          kind: result.error.kind,
          message: result.error.message,
        });
      }
      return result;
    },
    [],
  );

  const persistGameState = useCallback<UseRoundPersistenceReturn["persistGameState"]>(
    async (roundId, state) => {
      const result = await run<void>(async () => {
        await saveGameState(roundId, state as Parameters<typeof saveGameState>[1]);
      });
      setLastSaveFailed(!result.ok);
      if (!result.ok) {
        console.error("[persistence] saveGameState failed", {
          roundId,
          currentHole: state.currentHole,
          kind: result.error.kind,
          message: result.error.message,
        });
      }
      return result;
    },
    [],
  );

  const persistRoundEvent = useCallback<UseRoundPersistenceReturn["persistRoundEvent"]>(
    async (event) => {
      const result = await run<void>(async () => {
        await createRoundEvent(event);
      });
      if (!result.ok) {
        console.error("[persistence] createRoundEvent failed", {
          roundId: event.roundId,
          eventType: event.eventType,
          kind: result.error.kind,
        });
      }
      return result;
    },
    [],
  );

  const persistRoundCompletion = useCallback<UseRoundPersistenceReturn["persistRoundCompletion"]>(
    async (roundId) => {
      const result = await run<void>(async () => {
        await completeRound(roundId);
      });
      if (!result.ok) {
        console.error("[persistence] completeRound failed", { roundId, kind: result.error.kind });
      }
      return result;
    },
    [],
  );

  const persistSettlements = useCallback<UseRoundPersistenceReturn["persistSettlements"]>(
    async (roundId, settlements) => {
      const result = await run<void>(async () => {
        await insertSettlements(roundId, settlements);
      });
      if (!result.ok) {
        console.error("[persistence] insertSettlements failed", { roundId, kind: result.error.kind });
      }
      return result;
    },
    [],
  );

  const persistCancel = useCallback<UseRoundPersistenceReturn["persistCancel"]>(
    async (roundId) => {
      const result = await run<void>(async () => {
        await cancelRound(roundId);
      });
      if (!result.ok) {
        console.error("[persistence] cancelRound failed", { roundId, kind: result.error.kind });
      }
      return result;
    },
    [],
  );

  const persistBroadcast = useCallback<UseRoundPersistenceReturn["persistBroadcast"]>(
    async (roundId, enabled) => {
      const result = await run<void>(async () => {
        await toggleBroadcast(roundId, enabled);
      });
      if (!result.ok) {
        console.error("[persistence] toggleBroadcast failed", {
          roundId,
          enabled,
          kind: result.error.kind,
        });
      }
      return result;
    },
    [],
  );

  return {
    isOnline,
    lastSaveFailed,
    pendingSync,
    setPendingSync,
    persistPlayerScores,
    persistGameState,
    persistRoundEvent,
    persistRoundCompletion,
    persistSettlements,
    persistCancel,
    persistBroadcast,
  };
}
