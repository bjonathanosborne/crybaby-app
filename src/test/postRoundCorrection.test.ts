import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCapture } from "@/hooks/useCapture";
import type { CaptureFlowProps } from "@/components/capture/types";
import type { Player } from "@/lib/gameEngines";

/**
 * Bug 3 — post-completion capture path (now infrastructure-only).
 *
 * After PR #27 commit 2 the CrybabyActiveRound CTA + onApplied wiring
 * for post_round_correction were removed (no UI consumer). The hook
 * API + types + CaptureConfirmGrid behaviour are preserved so the
 * feature can be resurrected without re-deriving the wire format.
 *
 * Locks in:
 *   - useCapture.openPostRoundCorrection sets trigger="post_round_correction"
 *     and holeRange=[1,18] (always the full scorecard).
 *   - The onApplied callback receives the trigger label so a future
 *     page-level consumer can branch on it.
 *   - CaptureConfirmGrid treats post_round_correction like game_driven
 *     for share-toggle visibility (hidden on both).
 *
 * Removed coverage (was UI-level, now absent):
 *   - CrybabyActiveRound CTA render — the "Fix scores / add photo"
 *     button is gone (asserted absent in
 *     src/test/photoCapturePostRoundRemoved.test.ts).
 *   - onApplied → persistNeedsFinalPhoto branch — no caller; the
 *     needs_final_photo column on rounds is now dead data.
 */

describe("useCapture — openPostRoundCorrection", () => {
  const mockPlayer: Player = { id: "p1", name: "A", handicap: 0, color: "#000" };
  const baseProps: Omit<CaptureFlowProps, "trigger" | "holeRange" | "onComplete" | "onCancel"> = {
    roundId: "r1",
    players: [mockPlayer],
    pars: Array(18).fill(4),
    handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
    currentScores: {},
    roundPrivacy: "public",
  };

  it("sets trigger='post_round_correction' and holeRange=[1,18]", () => {
    const onApplied = vi.fn();
    const { result } = renderHook(() => useCapture({ base: baseProps, onApplied }));

    act(() => {
      result.current.openPostRoundCorrection();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeCapture?.trigger).toBe("post_round_correction");
    expect(result.current.activeCapture?.holeRange).toEqual([1, 18]);
  });

  it("passes trigger='post_round_correction' to onApplied on success", () => {
    const onApplied = vi.fn();
    const { result } = renderHook(() => useCapture({ base: baseProps, onApplied }));

    act(() => {
      result.current.openPostRoundCorrection();
    });

    // Fire the inner onComplete — emulates the CaptureFlow resolving.
    const captureResult = {
      captureId: "c1",
      applied: true,
      noop: false,
      totals: {},
      feedPublished: false,
    };
    act(() => {
      result.current.activeCapture?.onComplete(captureResult);
    });

    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledWith(captureResult, "post_round_correction");
    // Modal closes after onComplete.
    expect(result.current.isOpen).toBe(false);
  });

  it("ad-hoc and post_round_correction produce different triggers but the same [1,18] range", () => {
    const onApplied = vi.fn();
    const { result } = renderHook(() => useCapture({ base: baseProps, onApplied }));

    act(() => {
      result.current.openAdHoc();
    });
    expect(result.current.activeCapture?.trigger).toBe("ad_hoc");
    expect(result.current.activeCapture?.holeRange).toEqual([1, 18]);

    act(() => {
      result.current.activeCapture?.onCancel();
    });

    act(() => {
      result.current.openPostRoundCorrection();
    });
    expect(result.current.activeCapture?.trigger).toBe("post_round_correction");
    expect(result.current.activeCapture?.holeRange).toEqual([1, 18]);
  });
});

describe("Bug 3 — CaptureFlowProps type union includes post_round_correction", () => {
  it("types.ts CaptureFlowProps.trigger accepts post_round_correction", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/capture/types.ts"),
      "utf-8",
    );
    // The union must include post_round_correction so CaptureFlowProps
    // and the apply-capture server agree on allowed triggers.
    expect(src).toMatch(
      /trigger:\s*"game_driven"\s*\|\s*"ad_hoc"\s*\|\s*"post_round_correction"/,
    );
  });

  it("CaptureConfirmGrid trigger type also includes post_round_correction", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/capture/CaptureConfirmGrid.tsx"),
      "utf-8",
    );
    expect(src).toMatch(
      /trigger:\s*"game_driven"\s*\|\s*"ad_hoc"\s*\|\s*"post_round_correction"/,
    );
  });

  it("CaptureConfirmGrid hides the Share toggle for post_round_correction (same as game_driven)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/capture/CaptureConfirmGrid.tsx"),
      "utf-8",
    );
    // showShareToggle stays `trigger === "ad_hoc"`, so by negation it is
    // hidden for both game_driven AND post_round_correction. Verify the
    // default value also honors post_round_correction as "on for public".
    expect(src).toMatch(/showShareToggle\s*=\s*trigger\s*===\s*"ad_hoc"/);
    expect(src).toMatch(
      /trigger\s*===\s*"game_driven"\s*\|\|\s*trigger\s*===\s*"post_round_correction"/,
    );
  });
});

// PR #27 commit 2: "CrybabyActiveRound completed-round CTA" describe
// block removed. The CTA + its CaptureFlow render were dropped along
// with FinalPhotoGate. Absence assertions live in
// src/test/photoCapturePostRoundRemoved.test.ts so the regression
// guard is co-located with the rest of the post-round removal proofs.
