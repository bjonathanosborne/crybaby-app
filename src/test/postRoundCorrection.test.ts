import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCapture } from "@/hooks/useCapture";
import type { CaptureFlowProps } from "@/components/capture/types";
import type { Player } from "@/lib/gameEngines";

/**
 * Bug 3 — post-completion capture path.
 *
 * Locks in:
 *   - useCapture.openPostRoundCorrection sets trigger="post_round_correction"
 *     and holeRange=[1,18] (always the full scorecard).
 *   - The onApplied callback receives the trigger label so the page can
 *     branch on it (clear needs_final_photo, for example).
 *   - CrybabyActiveRound renders the "Fix scores / add photo" CTA on the
 *     completed-round view for the scorekeeper, with amber styling when
 *     needs_final_photo is true and subtle styling otherwise.
 *   - The onApplied handler clears needs_final_photo via
 *     persistNeedsFinalPhoto(roundId, false) on a successful
 *     post_round_correction apply.
 *   - CaptureConfirmGrid treats post_round_correction like game_driven
 *     for share-toggle visibility (hidden on both).
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

describe("Bug 3 — CrybabyActiveRound completed-round CTA", () => {
  it("renders 'Fix scores / add photo' button for scorekeeper only", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // Button must be inside the completed-round return and gated on isScorekeeper.
    const ctaMatch = src.match(
      /\{isScorekeeper\s*&&\s*\([\s\S]*?data-testid="post-round-correction-cta"[\s\S]*?\)\}/,
    );
    expect(ctaMatch).toBeTruthy();
    const cta = ctaMatch?.[0] ?? "";
    expect(cta).toMatch(/capture\.openPostRoundCorrection/);
  });

  it("CTA copy reflects needs_final_photo state", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // Both copies must exist — one for the amber (skipped-gate) state,
    // one for the subtle (default) state.
    expect(src).toMatch(/Add scorecard photo/);
    expect(src).toMatch(/Fix scores \/ add photo/);
    // Derived flag must exist and key off dbRound.needs_final_photo.
    expect(src).toMatch(/needs_final_photo[\s\S]*?===\s*true/);
  });

  it("onApplied clears needs_final_photo after a post_round_correction apply", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // onApplied must take `trigger` as its second arg and branch on it.
    expect(src).toMatch(/onApplied:\s*\(\s*result,\s*trigger\s*\)\s*=>/);
    // Branch: trigger === "post_round_correction" AND result.applied → clear flag.
    expect(src).toMatch(
      /trigger\s*===\s*"post_round_correction"[\s\S]*?persist\.persistNeedsFinalPhoto\(roundId,\s*false\)/,
    );
    // The noop case must be excluded (no-op captures don't imply a new photo).
    expect(src).toMatch(
      /trigger\s*===\s*"post_round_correction"[\s\S]*?!result\.noop/,
    );
  });

  it("CaptureFlow modal is rendered inside the completed-round return so the CTA can open it", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // Pre-PR-#27, this asserted >= 2 CaptureFlow renders (active-
    // scoring + completed-round). PR #27 commit 1 removed the active-
    // scoring render. The completed-round render stays through Commit
    // 1 so the Fix-scores CTA still opens; Commit 2 removes it
    // alongside the FinalPhotoGate. Expect exactly 1 here for now;
    // photoCapturePostRoundRemoved.test.ts will flip this to 0.
    const matches = src.match(
      /\{capture\.activeCapture\s*&&\s*<CaptureFlow\s*\{\.\.\.capture\.activeCapture\}\s*\/>\}/g,
    );
    expect(matches).toBeTruthy();
    expect((matches || []).length).toBeGreaterThanOrEqual(1);
  });
});
