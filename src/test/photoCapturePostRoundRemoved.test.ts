import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #27 commit 2 — Post-round photo capture UI removed.
//
// What this file verifies (in CrybabyActiveRound.tsx):
//   - FinalPhotoGate import + render are gone
//   - finalPhotoDecision / skipInFlight / gateCaptureInFlightRef state
//     declarations are gone
//   - handleTakeFinalPhoto / handleSkipFinalPhoto callbacks are gone
//   - The capture-cancel cleanup useEffect is gone
//   - The completion useEffect no longer gates on finalPhotoDecision
//   - The "Fix scores / add photo" + "Add scorecard photo" CTAs are
//     gone (no `data-testid="post-round-correction-cta"`, no copy)
//   - The completion-screen CaptureFlow render is gone
//   - The useCapture hook call is gone (no UI consumer left after
//     mid-round + post-round renders both removed)
//   - needs_final_photo column is no longer read by the page
//   - Preservation markers document the cuts
//
// Component-file preservation (FinalPhotoGate.tsx, useCapture.ts):
//   asserted by file-system check at the bottom. The implementation
//   files stay; they just have no callers in the runtime.
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

const SRC = readFile("src/pages/CrybabyActiveRound.tsx");

describe("CrybabyActiveRound — post-round photo imports gone (PR #27 commit 2)", () => {
  it("does NOT import FinalPhotoGate", () => {
    expect(SRC).not.toMatch(/import\s+FinalPhotoGate\s+from/);
  });

  it("does NOT import CaptureFlow (no render-site left)", () => {
    expect(SRC).not.toMatch(/import\s+CaptureFlow\s+from\s+["']@\/components\/capture\/CaptureFlow["']/);
  });

  it("does NOT import useCapture (no hook call left)", () => {
    expect(SRC).not.toMatch(/import\s*\{\s*useCapture\s*\}\s*from/);
  });
});

describe("CrybabyActiveRound — post-round photo state gone (PR #27 commit 2)", () => {
  it("does NOT declare finalPhotoDecision state", () => {
    expect(SRC).not.toMatch(/const\s+\[finalPhotoDecision,\s*setFinalPhotoDecision\]\s*=\s*useState/);
  });

  it("does NOT declare skipInFlight state", () => {
    expect(SRC).not.toMatch(/const\s+\[skipInFlight,\s*setSkipInFlight\]\s*=\s*useState/);
  });

  it("does NOT declare gateCaptureInFlightRef", () => {
    expect(SRC).not.toMatch(/gateCaptureInFlightRef\s*=\s*useRef/);
  });

  it("does NOT derive needsFinalPhoto from dbRound", () => {
    expect(SRC).not.toMatch(/const\s+needsFinalPhoto\s*=/);
  });
});

describe("CrybabyActiveRound — post-round photo handlers + effects gone (PR #27 commit 2)", () => {
  it("does NOT define handleTakeFinalPhoto", () => {
    expect(SRC).not.toMatch(/const\s+handleTakeFinalPhoto\s*=\s*useCallback/);
  });

  it("does NOT define handleSkipFinalPhoto", () => {
    expect(SRC).not.toMatch(/const\s+handleSkipFinalPhoto\s*=\s*useCallback/);
  });

  it("does NOT call useCapture()", () => {
    // Allow the comment that documents the removal but disallow an actual call.
    expect(SRC).not.toMatch(/const\s+capture\s*=\s*useCapture\(/);
  });

  it("does NOT call persist.persistNeedsFinalPhoto from the page", () => {
    expect(SRC).not.toMatch(/persist\.persistNeedsFinalPhoto\(/);
  });
});

describe("CrybabyActiveRound — completion useEffect no longer photo-gated (PR #27 commit 2)", () => {
  it("does NOT short-circuit the settlement save on finalPhotoDecision === 'pending'", () => {
    expect(SRC).not.toMatch(/finalPhotoDecision\s*===\s*"pending"/);
  });

  it("does NOT include finalPhotoDecision in any useEffect deps array", () => {
    expect(SRC).not.toMatch(/\[\s*[^\]]*\bfinalPhotoDecision\b[^\]]*\]/);
  });
});

describe("CrybabyActiveRound — post-round renders gone (PR #27 commit 2)", () => {
  it("does NOT render <FinalPhotoGate>", () => {
    expect(SRC).not.toMatch(/<FinalPhotoGate[\s>]/);
  });

  it("does NOT carry the post-round-correction CTA testid", () => {
    expect(SRC).not.toMatch(/data-testid="post-round-correction-cta"/);
  });

  it("does NOT include 'Add scorecard photo' copy", () => {
    expect(SRC).not.toMatch(/Add scorecard photo/);
  });

  it("does NOT include 'Fix scores / add photo' copy", () => {
    expect(SRC).not.toMatch(/Fix scores \/ add photo/);
  });

  it("does NOT call capture.openPostRoundCorrection from any render-site", () => {
    expect(SRC).not.toMatch(/capture\.openPostRoundCorrection/);
  });

  it("does NOT call capture.openAdHoc from any render-site", () => {
    expect(SRC).not.toMatch(/capture\.openAdHoc\(/);
  });

  it("does NOT render <CaptureFlow> anywhere in the file", () => {
    expect(SRC).not.toMatch(/<CaptureFlow\s/);
  });

  it("does NOT reference capture.activeCapture / capture.isOpen", () => {
    expect(SRC).not.toMatch(/capture\.activeCapture/);
    expect(SRC).not.toMatch(/capture\.isOpen/);
  });
});

describe("CrybabyActiveRound — preservation markers (PR #27 commit 2)", () => {
  it("import-block has a PR #27 marker referencing Commit 2", () => {
    // The umbrella PR #27 marker covers both commits; "Commit 2" must
    // appear nearby to anchor the post-round removal narrative.
    expect(SRC).toMatch(/PR #27[\s\S]{0,400}Commit 2/);
  });

  it("removed-render site documents that post-round photo UI is gone", () => {
    expect(SRC).toMatch(/Commit 2[\s\S]{0,200}post-round photo UI gone/);
  });

  it("preservation rationale references CaptureTile / CaptureAppliedCard", () => {
    expect(SRC).toMatch(/CaptureTile/);
    expect(SRC).toMatch(/CaptureAppliedCard/);
  });
});

// ============================================================
// File-system preservation: dead-code shims left in tree.
// PR #27's spec says don't delete the photo-pipeline component
// implementations even though they're no longer rendered.
// ============================================================

describe("Photo-pipeline component files preserved (PR #27 commit 2)", () => {
  it("src/components/FinalPhotoGate.tsx still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/components/FinalPhotoGate.tsx"))).toBe(true);
  });

  it("src/hooks/useCapture.ts still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/hooks/useCapture.ts"))).toBe(true);
  });

  it("src/components/capture/CaptureFlow.tsx still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/components/capture/CaptureFlow.tsx"))).toBe(true);
  });

  it("supabase/functions/apply-capture/index.ts still exists (edge fn preserved)", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../supabase/functions/apply-capture/index.ts"))).toBe(true);
  });

  it("supabase/functions/extract-scores/index.ts still exists (OCR edge fn preserved)", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../supabase/functions/extract-scores/index.ts"))).toBe(true);
  });
});
