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
 *
 * PR #27: Photo capture removed from gameplay UI. This hook is no
 * longer called anywhere in the runtime. The file is kept so the
 * wire format (CaptureTrigger union, UseCaptureArgs shape) remains
 * the canonical source of truth if the feature is resurrected, and
 * so the API tests in src/test/postRoundCorrection.test.ts that
 * lock in openPostRoundCorrection's contract still have a target.
 * No active call sites; safe to delete after a few months of
 * dead-code monitoring.
 */

export type CaptureTrigger = "game_driven" | "ad_hoc" | "post_round_correction";

export interface UseCaptureArgs {
  /** Base props all flows share (roundId, players, pars, handicaps, etc.). */
  base: Omit<CaptureFlowProps, "trigger" | "holeRange" | "onComplete" | "onCancel">;
  onApplied: (result: CaptureResult, trigger: CaptureTrigger) => void;
}

export interface UseCaptureReturn {
  /** Open the flow in ad-hoc mode covering all 18 holes. */
  openAdHoc: () => void;
  /** Open the flow in game-driven mode for a specific hole range. */
  openGameDriven: (holeRange: [number, number]) => void;
  /**
   * Open the flow in post-round-correction mode. Used from the
   * completed-round view's "Fix scores / add photo" CTA. Always covers
   * all 18 holes; apply-capture handles completed rounds by rewriting
   * non-manual settlements after the replay.
   */
  openPostRoundCorrection: () => void;
  /** True while any capture flow is open. */
  isOpen: boolean;
  /** The active props to pass to <CaptureFlow>, or null when closed. */
  activeCapture: CaptureFlowProps | null;
}

export function useCapture(args: UseCaptureArgs): UseCaptureReturn {
  const [activeCapture, setActiveCapture] = useState<CaptureFlowProps | null>(null);

  const close = useCallback(() => setActiveCapture(null), []);

  const onComplete = useCallback((trigger: CaptureTrigger) => (result: CaptureResult) => {
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

  const openPostRoundCorrection = useCallback(() => {
    setActiveCapture({
      ...args.base,
      trigger: "post_round_correction",
      holeRange: [1, 18],
      onComplete: onComplete("post_round_correction"),
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
    openPostRoundCorrection,
    isOpen: activeCapture !== null,
    activeCapture,
  };
}
