import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";

import FinishRoundConfirm from "@/components/round/FinishRoundConfirm";

// ============================================================
// PR #18 — Finish-round confirmation dialog.
//
// Covers:
//   (a) Component rendering + a11y (ARIA / focus / close semantics)
//   (b) Cancel / Confirm paths fire the right callbacks
//   (c) Confirming-state lockout
//   (d) SoloRound wiring: button opens dialog, doesn't save directly
//   (e) CrybabyActiveRound wiring: completion useEffect gated on
//       finishConfirmed; auto-open effect fires on hole 18; sticky
//       Finish Round CTA renders when appropriate. (PR #27 commit 2
//       removed the FinalPhotoGate-open-predicate assertion that
//       used to live in this group — the gate is gone.)
// ============================================================

beforeEach(() => cleanup());

// ---------- (a)+(b)+(c) component tests ----------

describe("<FinishRoundConfirm /> — component", () => {
  it("does not render in the DOM when closed", () => {
    render(
      <FinishRoundConfirm open={false} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.queryByTestId("finish-round-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("finish-round-confirm-title")).not.toBeInTheDocument();
  });

  it("renders title + description + both action buttons when open", () => {
    render(
      <FinishRoundConfirm open={true} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByTestId("finish-round-confirm-title")).toHaveTextContent(
      /Finish and save round\?/i,
    );
    expect(screen.getByTestId("finish-round-confirm-description")).toBeInTheDocument();
    expect(screen.getByTestId("finish-round-confirm-cancel")).toHaveTextContent(/Cancel/);
    expect(screen.getByTestId("finish-round-confirm-submit")).toHaveTextContent(/Finish Round/);
  });

  it("Cancel tap calls onCancel exactly once, onConfirm not called", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<FinishRoundConfirm open={true} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("finish-round-confirm-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Confirm tap calls onConfirm exactly once, onCancel not called", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<FinishRoundConfirm open={true} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("finish-round-confirm-submit"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Escape key triggers onCancel (Radix built-in) — dismiss-without-trap", () => {
    const onCancel = vi.fn();
    render(<FinishRoundConfirm open={true} onCancel={onCancel} onConfirm={() => {}} />);
    // Radix fires onOpenChange(false) on Esc, which our wrapper routes to onCancel.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("both buttons disabled during confirming state; label swaps to 'Saving…'", () => {
    render(
      <FinishRoundConfirm open={true} confirming={true} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByTestId("finish-round-confirm-cancel")).toBeDisabled();
    expect(screen.getByTestId("finish-round-confirm-submit")).toBeDisabled();
    expect(screen.getByTestId("finish-round-confirm-submit")).toHaveTextContent(/Saving…/);
  });

  it("a11y: dialog has role + aria attributes wired via Radix", () => {
    render(<FinishRoundConfirm open={true} onCancel={() => {}} onConfirm={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // DialogTitle + DialogDescription become aria-labelledby / -describedby in Radix.
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  });
});

// ---------- source-level wiring checks ----------

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

describe("SoloRound — Finish Round button wrapped in confirm", () => {
  const src = readFile("src/pages/SoloRound.jsx");

  it("imports the shared confirm component", () => {
    expect(src).toMatch(
      /import\s+FinishRoundConfirm\s+from\s+["']@\/components\/round\/FinishRoundConfirm["']/,
    );
  });

  it("declares showFinishConfirm state", () => {
    expect(src).toMatch(/\[showFinishConfirm,\s*setShowFinishConfirm\]\s*=\s*useState\(false\)/);
  });

  it("Finish Round button opens the dialog (onClick calls setShowFinishConfirm(true))", () => {
    // The button must no longer call finishRound directly.
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*setShowFinishConfirm\(true\)\}[\s\S]*?Finish Round/,
    );
    // And the *direct* wiring to finishRound on the button is gone.
    expect(src).not.toMatch(/<button[\s\S]*?onClick=\{finishRound\}/);
  });

  it("dialog's onConfirm triggers the existing finishRound() save flow", () => {
    expect(src).toMatch(/onConfirm=\{\s*\(\)\s*=>\s*\{[\s\S]*?finishRound\(\)[\s\S]*?\}\s*\}/);
  });

  it("dialog's onCancel closes the dialog (no save side effects)", () => {
    expect(src).toMatch(/onCancel=\{\(\)\s*=>\s*setShowFinishConfirm\(false\)\}/);
  });

  it("confirming prop is driven by the saving state", () => {
    expect(src).toMatch(/confirming=\{saving\}/);
  });
});

describe("CrybabyActiveRound — auto-finish gated on finishConfirmed", () => {
  const src = readFile("src/pages/CrybabyActiveRound.tsx");

  it("imports the shared confirm component", () => {
    expect(src).toMatch(
      /import\s+FinishRoundConfirm\s+from\s+["']@\/components\/round\/FinishRoundConfirm["']/,
    );
  });

  it("declares finishConfirmed + showFinishConfirm + finishAutoOpenedRef state", () => {
    expect(src).toMatch(/\[finishConfirmed,\s*setFinishConfirmed\]\s*=\s*useState<boolean>\(false\)/);
    expect(src).toMatch(/\[showFinishConfirm,\s*setShowFinishConfirm\]\s*=\s*useState<boolean>\(false\)/);
    expect(src).toMatch(/finishAutoOpenedRef\s*=\s*useRef<boolean>\(false\)/);
  });

  it("completion useEffect short-circuits when finishConfirmed is false", () => {
    // The guard must appear inside the completion-useEffect before the
    // persistRoundCompletion call.
    const persistPos = src.indexOf("persistRoundCompletion(roundId)");
    expect(persistPos).toBeGreaterThan(0);
    const window = src.slice(Math.max(0, persistPos - 1500), persistPos);
    expect(window).toMatch(/if \(!finishConfirmed\) return;/);
  });

  // PR #27 commit 2: FinalPhotoGate render removed — the open-predicate
  // assertion is gone with it. finishConfirmed still gates the
  // settlement-write useEffect (covered by the test above).

  it("auto-open effect flips showFinishConfirm to true on hole 18 (with ref guard)", () => {
    expect(src).toMatch(/finishAutoOpenedRef\.current\s*=\s*true/);
    expect(src).toMatch(/setShowFinishConfirm\(true\)/);
  });

  it("auto-open is scorekeeper-only + skips already-saved rounds", () => {
    // The effect body reads isScorekeeper + settlementsSaved as guards.
    const effStart = src.indexOf("finishAutoOpenedRef.current) return");
    expect(effStart).toBeGreaterThan(0);
    const window = src.slice(Math.max(0, effStart - 800), effStart + 200);
    expect(window).toMatch(/if \(!isScorekeeper\) return/);
    expect(window).toMatch(/if \(settlementsSaved\) return/);
  });

  it("sticky Finish Round CTA renders when completion pending + scorekeeper", () => {
    expect(src).toMatch(/data-testid="finish-round-cta-button"/);
    expect(src).toMatch(/Finish Round ⛳/);
    // Gated on scorekeeper + hole 18 + unsaved + not-yet-confirmed
    const ctaPos = src.indexOf('data-testid="finish-round-cta-container"');
    expect(ctaPos).toBeGreaterThan(0);
    const ctaWindow = src.slice(Math.max(0, ctaPos - 600), ctaPos);
    expect(ctaWindow).toMatch(/isScorekeeper/);
    expect(ctaWindow).toMatch(/currentHole >= 18/);
    expect(ctaWindow).toMatch(/holeResults\.length >= 18/);
    expect(ctaWindow).toMatch(/!finishConfirmed/);
    expect(ctaWindow).toMatch(/!settlementsSaved/);
  });

  it("dialog's onConfirm flips finishConfirmed (unlocking the finish chain) and closes", () => {
    expect(src).toMatch(
      /onConfirm=\{\(\)\s*=>\s*\{\s*setShowFinishConfirm\(false\);\s*setFinishConfirmed\(true\);\s*\}\}/,
    );
  });

  it("dialog's onCancel truly closes (no finishConfirmed mutation)", () => {
    // The onCancel lambda should not set finishConfirmed — cancel preserves
    // the un-latched state so the scorekeeper can edit + retry.
    const cancelRegex = /onCancel=\{\(\)\s*=>\s*setShowFinishConfirm\(false\)\}/;
    expect(src).toMatch(cancelRegex);
  });
});
