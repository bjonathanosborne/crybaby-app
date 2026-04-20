import { useState, useCallback } from "react";
import {
  calculateNassauSettlement,
  initFlipState,
  type HoleResult,
  type Player,
  type NassauState,
  type WolfState,
  type TeamInfo,
  type FlipState,
  type FlipConfig,
  type RollingCarryWindow,
  type CrybabyState,
} from "@/lib/gameEngines";

/**
 * Owns the in-memory state of an active round.
 *
 * Tracks the mutable bits that change with every hole: scores, totals,
 * holeResults, hammer state, and the match-state objects for Nassau and
 * Wolf. Exposes `advanceHole` as a pure COMPUTE function — given the
 * previous state and the current hole's result, returns the next state.
 * The caller (the page component or the persistence hook) is responsible
 * for calling `setTotals` / `setCurrentHole` / etc. with the computed
 * values. No DB writes happen here.
 *
 * This hook is the foundation the photo-capture pipeline will consume to
 * apply confirmed captures — `applyCapture(newScores)` will call the same
 * compute path via replayRound().
 */

export interface RoundStateSnapshot {
  currentHole: number;
  /** scores[hole][playerId] = gross score */
  scores: Record<number, Record<string, number>>;
  /** per-player cumulative dollar totals */
  totals: Record<string, number>;
  /** per-hole computed result (HoleResult with hole number). Resumed holes
   *  carry a placeholder { push: false, resumed: true } for UI progress dots. */
  holeResults: (HoleResult & { hole: number; resumed?: boolean })[];
  hammerDepth: number;
  /** { hole, hammerDepth, folded, foldWinnerTeamId? } per played hole */
  hammerHistory: Array<{
    hole: number;
    hammerDepth: number;
    folded: boolean;
    foldWinnerTeamId?: string | null;
  }>;
  hammerPending: boolean;
  lastHammerBy: string | null;
  carryOver: number;
  /**
   * Legacy flipTeams (static per-round). Kept for backward compat with
   * tests + any callers reading the single shape. New code should read
   * `flipState.teamsByHole[currentHole]` instead — that's the per-hole
   * shape the engine + persistence path actually use.
   */
  flipTeams: TeamInfo | null;
  /**
   * Flip base game state. `teamsByHole[N]` is the locked team assignment
   * for hole N (1..15). Mutated by FlipReel confirm handlers + by
   * `advanceFlipState` on a push-carry.
   */
  flipState: FlipState;
  /** Scorekeeper's Flip setup choices (base bet + carry-over window). */
  flipConfig: FlipConfig | null;
  /** Flip base-game rolling carry-over window (FIFO push pot queue). */
  rollingCarryWindow: RollingCarryWindow | null;
  /**
   * Flip crybaby sub-game state (holes 16-18). Populated by the
   * CrybabyTransition screen at hole 15 → 16 handoff. Null during
   * holes 1-15 and for non-Flip rounds.
   */
  crybabyState: CrybabyState | null;
  wolfState: WolfState;
  nassauState: NassauState;
  nassauPresses: { startHole: number; match: Record<string, number> }[];
}

/**
 * Inputs to `computeAdvanceHole` — everything needed to apply one hole's
 * result to a `RoundStateSnapshot` and return the next snapshot.
 */
export interface AdvanceHoleInput {
  result: HoleResult;
  currentHole: number;
  gameMode: string;
  players: Player[];
  holeValue: number;
  /** Teams in play for this hole (already resolved by the page). */
  teams: TeamInfo | null;
  /** Nassau 2v2 split (null for individual or non-Nassau). */
  nassauTeams: TeamInfo | null;
}

/**
 * Pure compute of the next round state given the hole just scored.
 * No React, no state mutations on the input — always returns a new object.
 * Exported standalone so it can be unit-tested without React render.
 */
export function computeAdvanceHole(
  prev: RoundStateSnapshot,
  input: AdvanceHoleInput,
): RoundStateSnapshot {
  const { result, currentHole, gameMode, players, holeValue, nassauTeams } = input;

  // --- Nassau: zero per-hole amounts; totals derive from segment settlement ---
  let newNassauState = prev.nassauState;
  let newTotals: Record<string, number> = { ...prev.totals };

  if (gameMode === "nassau") {
    const winnerIds =
      result.winnerIds && result.winnerIds.length > 0
        ? result.winnerIds
        : result.playerResults.filter(pr => pr.amount > 0).map(pr => pr.id);

    newNassauState = {
      frontMatch: { ...prev.nassauState.frontMatch },
      backMatch: { ...prev.nassauState.backMatch },
      overallMatch: { ...prev.nassauState.overallMatch },
      presses: prev.nassauState.presses.map(p => ({
        startHole: p.startHole,
        match: { ...p.match },
      })),
    };
    if (!result.push && winnerIds.length > 0) {
      const bump = (map: Record<string, number>, id: string) => {
        map[id] = (map[id] || 0) + 1;
      };
      winnerIds.forEach(wid => {
        if (currentHole <= 9) bump(newNassauState.frontMatch, wid);
        else bump(newNassauState.backMatch, wid);
        bump(newNassauState.overallMatch, wid);
      });
      newNassauState.presses = newNassauState.presses.map(press => {
        const segmentEnd = press.startHole <= 9 ? 9 : 18;
        if (currentHole >= press.startHole && currentHole <= segmentEnd) {
          const updated = { ...press.match };
          winnerIds.forEach(wid => bump(updated, wid));
          return { ...press, match: updated };
        }
        return press;
      });
    }

    const settlement = calculateNassauSettlement(
      players,
      nassauTeams,
      newNassauState,
      holeValue,
      currentHole,
    );
    players.forEach(p => {
      newTotals[p.id] = settlement.playerAmounts[p.id] || 0;
    });
  } else {
    // Non-Nassau: sum per-hole amounts as usual
    result.playerResults.forEach(pr => {
      newTotals[pr.id] = (newTotals[pr.id] || 0) + pr.amount;
    });
  }

  // Fold winner team (for hammer history)
  let foldWinnerTeamId: string | null = null;
  if (result.folded && input.teams) {
    const winnerPlayer = result.playerResults.find(pr => pr.amount > 0);
    if (winnerPlayer) {
      foldWinnerTeamId = input.teams.teamA.players.some(p => p.id === winnerPlayer.id) ? "A" : "B";
    }
  }

  return {
    ...prev,
    currentHole: currentHole < 18 ? currentHole + 1 : currentHole,
    totals: newTotals,
    holeResults: [...prev.holeResults, { hole: currentHole, ...result }],
    hammerDepth: 0,
    hammerPending: false,
    lastHammerBy: null,
    hammerHistory: [
      ...prev.hammerHistory,
      {
        hole: currentHole,
        hammerDepth: prev.hammerDepth,
        folded: !!result.folded,
        foldWinnerTeamId,
      },
    ],
    carryOver: result.carryOver || 0,
    nassauState: newNassauState,
  };
}

/**
 * React hook wrapping the state + a callable `advanceHole` that applies
 * `computeAdvanceHole` to current state and calls the individual setters.
 */
export interface UseRoundStateReturn {
  // Core state
  currentHole: number;
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>;
  scores: RoundStateSnapshot["scores"];
  setScores: React.Dispatch<React.SetStateAction<RoundStateSnapshot["scores"]>>;
  totals: Record<string, number>;
  setTotals: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  holeResults: RoundStateSnapshot["holeResults"];
  setHoleResults: React.Dispatch<React.SetStateAction<RoundStateSnapshot["holeResults"]>>;

  // Hammer
  hammerDepth: number;
  setHammerDepth: React.Dispatch<React.SetStateAction<number>>;
  hammerHistory: RoundStateSnapshot["hammerHistory"];
  setHammerHistory: React.Dispatch<React.SetStateAction<RoundStateSnapshot["hammerHistory"]>>;
  hammerPending: boolean;
  setHammerPending: React.Dispatch<React.SetStateAction<boolean>>;
  lastHammerBy: string | null;
  setLastHammerBy: React.Dispatch<React.SetStateAction<string | null>>;

  // Bet state
  carryOver: number;
  setCarryOver: React.Dispatch<React.SetStateAction<number>>;

  // Team / mode state
  flipTeams: TeamInfo | null;
  setFlipTeams: React.Dispatch<React.SetStateAction<TeamInfo | null>>;
  flipState: FlipState;
  setFlipState: React.Dispatch<React.SetStateAction<FlipState>>;
  flipConfig: FlipConfig | null;
  setFlipConfig: React.Dispatch<React.SetStateAction<FlipConfig | null>>;
  rollingCarryWindow: RollingCarryWindow | null;
  setRollingCarryWindow: React.Dispatch<React.SetStateAction<RollingCarryWindow | null>>;
  crybabyState: CrybabyState | null;
  setCrybabyState: React.Dispatch<React.SetStateAction<CrybabyState | null>>;
  wolfState: WolfState;
  setWolfState: React.Dispatch<React.SetStateAction<WolfState>>;
  nassauState: NassauState;
  setNassauState: React.Dispatch<React.SetStateAction<NassauState>>;
  nassauPresses: RoundStateSnapshot["nassauPresses"];
  setNassauPresses: React.Dispatch<React.SetStateAction<RoundStateSnapshot["nassauPresses"]>>;

  // Handle a per-player score entry on the current hole.
  handleScoreChange: (playerId: string, score: number | null) => void;

  // Snapshot the entire in-memory state (useful for persistence callbacks).
  getSnapshot: () => RoundStateSnapshot;

  // Pure advance compute, re-exported for testing + direct use.
  computeAdvanceHole: typeof computeAdvanceHole;
}

/**
 * Initialize the round state hook. Does NOT require players at call time —
 * round data is loaded asynchronously and the page component seeds final
 * values (nassauState, wolfState, flipTeams) via setters after load.
 */
export function useRoundState(): UseRoundStateReturn {
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState<RoundStateSnapshot["scores"]>({});
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [holeResults, setHoleResults] = useState<RoundStateSnapshot["holeResults"]>([]);
  const [hammerDepth, setHammerDepth] = useState(0);
  const [hammerHistory, setHammerHistory] = useState<RoundStateSnapshot["hammerHistory"]>([]);
  const [hammerPending, setHammerPending] = useState(false);
  const [lastHammerBy, setLastHammerBy] = useState<string | null>(null);
  const [carryOver, setCarryOver] = useState(0);
  const [flipTeams, setFlipTeams] = useState<TeamInfo | null>(null);
  const [flipState, setFlipState] = useState<FlipState>(() => initFlipState());
  const [flipConfig, setFlipConfig] = useState<FlipConfig | null>(null);
  const [rollingCarryWindow, setRollingCarryWindow] = useState<RollingCarryWindow | null>(null);
  const [crybabyState, setCrybabyState] = useState<CrybabyState | null>(null);
  const [wolfState, setWolfState] = useState<WolfState>({
    wolfOrder: [],
    currentWolfIndex: 0,
    partnerSelected: null,
    isLoneWolf: false,
  });
  const [nassauState, setNassauState] = useState<NassauState>({
    frontMatch: {},
    backMatch: {},
    overallMatch: {},
    presses: [],
  });
  const [nassauPresses, setNassauPresses] = useState<RoundStateSnapshot["nassauPresses"]>([]);

  const handleScoreChange = useCallback((playerId: string, score: number | null) => {
    setScores(prev => ({
      ...prev,
      [currentHole]: { ...(prev[currentHole] || {}), [playerId]: score as number },
    }));
  }, [currentHole]);

  const getSnapshot = useCallback((): RoundStateSnapshot => ({
    currentHole,
    scores,
    totals,
    holeResults,
    hammerDepth,
    hammerHistory,
    hammerPending,
    lastHammerBy,
    carryOver,
    flipTeams,
    flipState,
    flipConfig,
    rollingCarryWindow,
    crybabyState,
    wolfState,
    nassauState,
    nassauPresses,
  }), [
    currentHole, scores, totals, holeResults, hammerDepth, hammerHistory,
    hammerPending, lastHammerBy, carryOver, flipTeams, flipState, flipConfig,
    rollingCarryWindow, crybabyState, wolfState, nassauState, nassauPresses,
  ]);

  return {
    currentHole, setCurrentHole,
    scores, setScores,
    totals, setTotals,
    holeResults, setHoleResults,
    hammerDepth, setHammerDepth,
    hammerHistory, setHammerHistory,
    hammerPending, setHammerPending,
    lastHammerBy, setLastHammerBy,
    carryOver, setCarryOver,
    flipTeams, setFlipTeams,
    flipState, setFlipState,
    flipConfig, setFlipConfig,
    rollingCarryWindow, setRollingCarryWindow,
    crybabyState, setCrybabyState,
    wolfState, setWolfState,
    nassauState, setNassauState,
    nassauPresses, setNassauPresses,
    handleScoreChange,
    getSnapshot,
    computeAdvanceHole,
  };
}
