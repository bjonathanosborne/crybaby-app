import { useCallback, useState } from "react";
import type { CaptureFlowProps, CaptureResult } from "@/components/capture/types";

/**
 * Coordinator hook: owns the single CaptureFlow modal instance shared
 * between CaptureButton (ad-hoc) and CapturePrompt (game-driven).
 *
 * The page calls `openAdHoc()` from the FAB and `openGameDriven(range)`
 * from the prompt banner — both set `activeCapture` to the same modal
 * props shape, guaranteeing one modal at a time. The CaptureFlow
 * component itself is rendered by the page based on `activeCapture`.
 *
 * When the flow resolves, `onComplete` or `onCancel` fire through this
 * hook's callbacks, which close the modal and forward the result to
 * the page so it can bump `captureApplied` on useAdvanceHole.
 */

export interface UseCaptureArgs {
  /** Base props all flows share (roundId, players, pars, handicaps, etc.). */
  base: Omit<CaptureFlowProps, "trigger" | "holeRange" | "onComplete" | "onCancel">;
  onApplied: (result: CaptureResult, trigger: "game_driven" | "ad_hoc") => void;
}

export interface UseCaptureReturn {
  /** Open the flow in ad-hoc mode covering all 18 holes. */
  openAdHoc: () => void;
  /** Open the flow in game-driven mode for a specific hole range. */
  openGameDriven: (holeRange: [number, number]) => void;
  /** True while any capture flow is open. */
  isOpen: boolean;
  /** The active props to pass to <CaptureFlow>, or null when closed. */
  activeCapture: CaptureFlowProps | null;
}

export function useCapture(args: UseCaptureArgs): UseCaptureReturn {
  const [activeCapture, setActiveCapture] = useState<CaptureFlowProps | null>(null);

  const close = useCallback(() => setActiveCapture(null), []);

  const onComplete = useCallback((trigger: "game_driven" | "ad_hoc") => (result: CaptureResult) => {
    setActiveCapture(null);
    args.onApplied(result, trigger);
  }, [args]);

  const onCancel = useCallback(() => {
    setActiveCapture(null);
  }, []);

  const openAdHoc = useCallback(() => {
    setActiveCapture({
      ...args.base,
      trigger: "ad_hoc",
      holeRange: [1, 18],
      onComplete: onComplete("ad_hoc"),
      onCancel,
    });
  }, [args.base, onComplete, onCancel]);

  const openGameDriven = useCallback((holeRange: [number, number]) => {
    setActiveCapture({
      ...args.base,
      trigger: "game_driven",
      holeRange,
      onComplete: onComplete("game_driven"),
      onCancel,
    });
  }, [args.base, onComplete, onCancel]);

  // close() is intentionally unused publicly — the modal closes via
  // onComplete or onCancel from the flow; external-force-close would be
  // a footgun. Keep the helper for potential future "cancel from parent".
  void close;

  return {
    openAdHoc,
    openGameDriven,
    isOpen: activeCapture !== null,
    activeCapture,
  };
}
