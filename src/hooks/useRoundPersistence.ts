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

/**
 * Owns all DB writes and network-state tracking for an active round.
 *
 * Every method returns a promise the caller can `await` — no silent
 * fire-and-forget. The component decides how to surface failures (banner,
 * retry queue, toast). This is the "persistence seam" the Phase 2 photo
 * capture flow writes against.
 */
export interface UseRoundPersistenceReturn {
  /** Online state from browser `navigator.onLine` + `online`/`offline` events. */
  isOnline: boolean;
  /** True if the last saveGameState attempt failed. UI shows a warning badge. */
  lastSaveFailed: boolean;
  /** Count of pending persists (incremented on write attempt, reset on reconnect). */
  pendingSync: number;
  setPendingSync: React.Dispatch<React.SetStateAction<number>>;

  // DB write wrappers — all return promises, none swallow errors.
  persistPlayerScores: (
    playerId: string,
    holeScores: Record<number, number>,
    totalScore: number,
  ) => Promise<void>;

  persistGameState: (
    roundId: string,
    state: {
      currentHole: number;
      carryOver: number;
      totals: Record<string, number>;
      hammerHistory?: unknown[];
    },
  ) => Promise<void>;

  emitRoundEvent: (args: {
    roundId: string;
    roundPlayerId?: string | null;
    holeNumber: number;
    grossScore?: number | null;
    par?: number | null;
    eventType: string;
    eventData?: Record<string, any>;
  }) => Promise<any>;

  markRoundComplete: (roundId: string) => Promise<any>;
  writeSettlements: (
    roundId: string,
    settlements: { userId?: string | null; guestName?: string | null; amount: number }[],
  ) => Promise<void>;
  cancel: (roundId: string) => Promise<any>;
  setBroadcast: (roundId: string, enabled: boolean) => Promise<void>;
}

export function useRoundPersistence(): UseRoundPersistenceReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [lastSaveFailed, setLastSaveFailed] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

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

  const persistPlayerScores = useCallback(
    async (playerId: string, holeScores: Record<number, number>, totalScore: number) => {
      setPendingSync(n => n + 1);
      try {
        await updatePlayerScores(playerId, holeScores, totalScore);
      } catch (err) {
        console.error("[persistence] updatePlayerScores failed", { playerId, err });
        throw err;
      } finally {
        setPendingSync(n => Math.max(0, n - 1));
      }
    },
    [],
  );

  const persistGameState = useCallback(
    async (roundId: string, state) => {
      try {
        await saveGameState(roundId, state as any);
        setLastSaveFailed(false);
      } catch (err) {
        console.error("[persistence] saveGameState failed", {
          roundId,
          currentHole: state?.currentHole,
          err,
        });
        setLastSaveFailed(true);
        throw err;
      }
    },
    [],
  );

  const emitRoundEvent = useCallback(async (args) => {
    try {
      return await createRoundEvent(args);
    } catch (err) {
      console.error("[persistence] createRoundEvent failed", {
        roundId: args.roundId,
        eventType: args.eventType,
        err,
      });
      throw err;
    }
  }, []);

  const markRoundComplete = useCallback(async (roundId: string) => {
    try {
      return await completeRound(roundId);
    } catch (err) {
      console.error("[persistence] completeRound failed", { roundId, err });
      throw err;
    }
  }, []);

  const writeSettlements = useCallback(async (roundId: string, settlements) => {
    try {
      await insertSettlements(roundId, settlements as any);
    } catch (err) {
      console.error("[persistence] insertSettlements failed", { roundId, err });
      throw err;
    }
  }, []);

  const cancel = useCallback(async (roundId: string) => {
    try {
      return await cancelRound(roundId);
    } catch (err) {
      console.error("[persistence] cancelRound failed", { roundId, err });
      throw err;
    }
  }, []);

  const setBroadcast = useCallback(async (roundId: string, enabled: boolean) => {
    try {
      await toggleBroadcast(roundId, enabled);
    } catch (err) {
      console.error("[persistence] toggleBroadcast failed", { roundId, enabled, err });
      throw err;
    }
  }, []);

  return {
    isOnline,
    lastSaveFailed,
    pendingSync,
    setPendingSync,
    persistPlayerScores,
    persistGameState,
    emitRoundEvent,
    markRoundComplete,
    writeSettlements,
    cancel,
    setBroadcast,
  };
}
