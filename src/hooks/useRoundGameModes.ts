import { useCallback, useEffect, useRef, useState } from "react";
import type { HoleResult } from "@/lib/gameEngines";

/**
 * Config the user picks in the Crybaby setup modal at hole 16.
 * - hammerDepth: starting hammer depth for the crybaby phase.
 * - crybabyId: round_players.id of the player designated as crybaby.
 */
export interface CrybabConfig {
  hammerDepth?: number;
  crybabyId?: string | null;
}

/**
 * Owns the modal state and mode-specific event handlers for the active round.
 *
 * This is where hammer / wolf / crybaby / press / cancel / leave modal
 * lifecycle lives. Game *logic* (calculating hole results, settlement) stays
 * pure in `@/lib/gameEngines`. Round *state* (scores, currentHole, totals)
 * lives in `useRoundState`. This hook is just the UI coordination layer.
 */
export interface UseRoundGameModesReturn {
  // Hammer
  showHammer: boolean;
  setShowHammer: React.Dispatch<React.SetStateAction<boolean>>;

  // Hole-result preview (shown after score submit, before advance)
  showResult: HoleResult | null;
  setShowResult: React.Dispatch<React.SetStateAction<HoleResult | null>>;

  // Crybaby setup (hole 16 onboarding)
  showCrybabSetup: boolean;
  setShowCrybabSetup: React.Dispatch<React.SetStateAction<boolean>>;
  crybabConfig: CrybabConfig | null;
  setCrybabConfig: React.Dispatch<React.SetStateAction<CrybabConfig | null>>;

  // Flip team-shuffle modal
  showFlipModal: boolean;
  setShowFlipModal: React.Dispatch<React.SetStateAction<boolean>>;

  // Wolf partner pick
  showWolfModal: boolean;
  setShowWolfModal: React.Dispatch<React.SetStateAction<boolean>>;
  wolfModalShownForHole: number;
  setWolfModalShownForHole: React.Dispatch<React.SetStateAction<number>>;
  wolfPartner: string | null;
  setWolfPartner: React.Dispatch<React.SetStateAction<string | null>>;
  isLoneWolf: boolean;
  setIsLoneWolf: React.Dispatch<React.SetStateAction<boolean>>;

  // Nassau press modal
  showPressModal: boolean;
  setShowPressModal: React.Dispatch<React.SetStateAction<boolean>>;

  // Cancel / leave flow
  showCancelConfirm: boolean;
  setShowCancelConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  showLeaveConfirm: boolean;
  setShowLeaveConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  canceling: boolean;
  setCanceling: React.Dispatch<React.SetStateAction<boolean>>;
  isCanceled: boolean;
  setIsCanceled: React.Dispatch<React.SetStateAction<boolean>>;

  // Leaderboard & live feed
  showLeaderboard: boolean;
  setShowLeaderboard: React.Dispatch<React.SetStateAction<boolean>>;
  showLiveFeed: boolean;
  setShowLiveFeed: React.Dispatch<React.SetStateAction<boolean>>;

  // Pre-nav deferred action (block exit while a modal is unresolved)
  pendingNavRef: React.MutableRefObject<null | (() => void)>;

  // Wolf modal convenience handlers
  confirmWolfPartner: (partnerId: string) => void;
  confirmLoneWolf: () => void;

  // Crybaby config confirm
  confirmCrybabConfig: (config: CrybabConfig) => void;

  /**
   * Open the wolf-partner modal if the current hole needs one (wolf game
   * and we haven't shown the modal for this hole yet). Called from an effect
   * in the round page when currentHole changes.
   */
  maybeOpenWolfModal: (args: {
    isWolfMode: boolean;
    currentHole: number;
    hasDesignatedWolf: boolean;
    hasSelection: boolean;
  }) => void;
}

export function useRoundGameModes(): UseRoundGameModesReturn {
  const [showHammer, setShowHammer] = useState(false);
  const [showResult, setShowResult] = useState<HoleResult | null>(null);
  const [showCrybabSetup, setShowCrybabSetup] = useState(false);
  const [crybabConfig, setCrybabConfig] = useState<CrybabConfig | null>(null);
  const [showFlipModal, setShowFlipModal] = useState(false);
  const [showWolfModal, setShowWolfModal] = useState(false);
  const [wolfModalShownForHole, setWolfModalShownForHole] = useState(0);
  const [wolfPartner, setWolfPartner] = useState<string | null>(null);
  const [isLoneWolf, setIsLoneWolf] = useState(false);
  const [showPressModal, setShowPressModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [isCanceled, setIsCanceled] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  const pendingNavRef = useRef<null | (() => void)>(null);

  const confirmWolfPartner = useCallback((partnerId: string) => {
    setWolfPartner(partnerId);
    setIsLoneWolf(false);
    setShowWolfModal(false);
  }, []);

  const confirmLoneWolf = useCallback(() => {
    setWolfPartner(null);
    setIsLoneWolf(true);
    setShowWolfModal(false);
  }, []);

  const confirmCrybabConfig = useCallback((config: CrybabConfig) => {
    setCrybabConfig(config);
    setShowCrybabSetup(false);
  }, []);

  /**
   * Guard logic for reopening the wolf modal on hole change. Avoids the
   * loop bug (commit 747ef77 era) where the modal would reopen on its own
   * effect run after being dismissed.
   */
  const maybeOpenWolfModal = useCallback(
    ({ isWolfMode, currentHole, hasDesignatedWolf, hasSelection }: {
      isWolfMode: boolean;
      currentHole: number;
      hasDesignatedWolf: boolean;
      hasSelection: boolean;
    }) => {
      if (!isWolfMode || !hasDesignatedWolf) return;
      if (hasSelection) return; // partner or lone wolf already picked for this hole
      if (wolfModalShownForHole === currentHole) return;
      setShowWolfModal(true);
      setWolfModalShownForHole(currentHole);
    },
    [wolfModalShownForHole],
  );

  // Reset wolf selection when moving to a new hole.
  // (Side effect moved here so the component doesn't need to own it.)
  useEffect(() => {
    // Intentionally no-op at hook init; the component wires a currentHole
    // effect that resets via setWolfPartner / setIsLoneWolf directly.
  }, []);

  return {
    showHammer, setShowHammer,
    showResult, setShowResult,
    showCrybabSetup, setShowCrybabSetup,
    crybabConfig, setCrybabConfig,
    showFlipModal, setShowFlipModal,
    showWolfModal, setShowWolfModal,
    wolfModalShownForHole, setWolfModalShownForHole,
    wolfPartner, setWolfPartner,
    isLoneWolf, setIsLoneWolf,
    showPressModal, setShowPressModal,
    showCancelConfirm, setShowCancelConfirm,
    showLeaveConfirm, setShowLeaveConfirm,
    canceling, setCanceling,
    isCanceled, setIsCanceled,
    showLeaderboard, setShowLeaderboard,
    showLiveFeed, setShowLiveFeed,
    pendingNavRef,
    confirmWolfPartner,
    confirmLoneWolf,
    confirmCrybabConfig,
    maybeOpenWolfModal,
  };
}
