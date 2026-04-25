import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #27 commit 1 — Mid-round photo capture UI removed.
//
// What this file verifies:
//   - CrybabyActiveRound no longer imports CapturePrompt, CaptureButton,
//     or useCaptureCadence
//   - The cadenceResult / captureCadenceInput / captureAppliedForCurrent
//     derivations are gone
//   - The lastCapturedHole state is gone (along with the
//     setLastCapturedHole call inside onApplied)
//   - The <CapturePrompt>, <CaptureButton>, and active-round
//     <CaptureFlow> render-sites are absent
//   - PR #27 marker comments document what was removed and why
//
// Mid-round flow tests stay separate from the post-round flow tests
// (Commit 2 will land photoCapturePostRoundRemoved.test.ts). Backend
// infrastructure (apply-capture edge fn, round_captures table,
// scorecards storage bucket) is intentionally untouched and not
// covered by these tests — they're tested where they live.
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

const SRC = readFile("src/pages/CrybabyActiveRound.tsx");

describe("CrybabyActiveRound — mid-round photo imports gone (PR #27 commit 1)", () => {
  it("does NOT import CapturePrompt", () => {
    expect(SRC).not.toMatch(/import\s+CapturePrompt\s+from/);
  });

  it("does NOT import CaptureButton", () => {
    expect(SRC).not.toMatch(/import\s+CaptureButton\s+from/);
  });

  it("does NOT import useCaptureCadence", () => {
    expect(SRC).not.toMatch(/import\s*\{\s*useCaptureCadence\s*\}\s*from/);
  });

  it("STILL imports CaptureFlow (used by the completion-screen Fix-scores button until Commit 2)", () => {
    // CaptureFlow stays through Commit 1 because the completion-screen
    // <CaptureFlow {...capture.activeCapture} /> render still depends
    // on it. Commit 2 removes that, then this assertion can flip.
    expect(SRC).toMatch(/import\s+CaptureFlow\s+from\s+["']@\/components\/capture\/CaptureFlow["']/);
  });
});

describe("CrybabyActiveRound — cadence derivations gone (PR #27 commit 1)", () => {
  it("does NOT call useCaptureCadence", () => {
    expect(SRC).not.toMatch(/useCaptureCadence\(/);
  });

  it("does NOT compute cadenceResult", () => {
    expect(SRC).not.toMatch(/const\s+cadenceResult\s*=/);
  });

  it("does NOT compute captureCadenceInput", () => {
    expect(SRC).not.toMatch(/const\s+captureCadenceInput\s*=/);
  });

  it("does NOT compute captureAppliedForCurrent", () => {
    expect(SRC).not.toMatch(/const\s+captureAppliedForCurrent\s*=/);
  });
});

describe("CrybabyActiveRound — lastCapturedHole state gone (PR #27 commit 1)", () => {
  it("does NOT declare lastCapturedHole as state", () => {
    expect(SRC).not.toMatch(/const\s+\[lastCapturedHole,\s*setLastCapturedHole\]\s*=\s*useState/);
  });

  it("does NOT call setLastCapturedHole anywhere", () => {
    expect(SRC).not.toMatch(/setLastCapturedHole\(/);
  });
});

describe("CrybabyActiveRound — mid-round renders gone (PR #27 commit 1)", () => {
  it("does NOT render <CapturePrompt>", () => {
    expect(SRC).not.toMatch(/<CapturePrompt[\s>]/);
  });

  it("does NOT render <CaptureButton>", () => {
    expect(SRC).not.toMatch(/<CaptureButton[\s>]/);
  });

  it("does NOT call capture.openGameDriven from a render-site", () => {
    expect(SRC).not.toMatch(/capture\.openGameDriven\(/);
  });

  it("does NOT render the active-round <CaptureFlow> sibling next to CapturePrompt/CaptureButton", () => {
    // Specifically the active-round rendering — search for the comment
    // that anchors the deletion site.
    expect(SRC).toMatch(/PR #27: Mid-round photo UI removed/);
    // Should NOT find the old "Phase 2 capture flow modal" sibling
    // comment that lived next to the active-round flow modal at line 2546.
    expect(SRC).not.toMatch(/Phase 2 capture flow modal — shared by ad-hoc \+ game-driven/);
  });
});

describe("CrybabyActiveRound — onApplied no longer tracks last hole captured (PR #27 commit 1)", () => {
  it("onApplied callback is preserved (still triggered by post-round-correction CaptureFlow)", () => {
    // The callback shape stays — it still fires on apply-capture replays.
    // Just doesn't track lastCapturedHole anymore.
    expect(SRC).toMatch(/onApplied:\s*\(result,\s*trigger\)\s*=>\s*\{/);
  });

  it("onApplied still bumps retryNonce when result is not noop", () => {
    expect(SRC).toMatch(/setRetryNonce\(n\s*=>\s*n\s*\+\s*1\)/);
  });
});

describe("CrybabyActiveRound — preservation markers (PR #27 commit 1)", () => {
  it("import-block has a PR #27 comment explaining what was removed", () => {
    expect(SRC).toMatch(/PR #27:\s*Photo capture removed from gameplay UI/);
  });

  it("removed-render site has a PR #27 marker comment for next reviewer", () => {
    expect(SRC).toMatch(/PR #27: Mid-round photo UI removed/);
  });

  it("preservation rationale is documented (legacy display kept, components stay)", () => {
    // Comments are line-broken with `// ` prefixes — the substring
    // appears across two lines in the source. Search for both halves
    // independently.
    expect(SRC).toMatch(/legacy/);
    expect(SRC).toMatch(/captures keep displaying/);
    expect(SRC).toMatch(/Components themselves[\s\S]{0,40}remain/);
  });
});

// ============================================================
// Component-file preservation: CapturePrompt + CaptureButton stay
// in the tree even though they're not rendered. Verifies the file
// system, not behaviour — guards against an over-eager cleanup that
// deletes the components prematurely (would break the resurrect
// path the user explicitly preserved).
// ============================================================

describe("Capture component files preserved (PR #27 spec: don't delete infrastructure)", () => {
  it("src/components/capture/CapturePrompt.tsx still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/components/capture/CapturePrompt.tsx"))).toBe(true);
  });

  it("src/components/capture/CaptureButton.tsx still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/components/capture/CaptureButton.tsx"))).toBe(true);
  });

  it("src/components/capture/CaptureFlow.tsx still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/components/capture/CaptureFlow.tsx"))).toBe(true);
  });

  it("src/hooks/useCaptureCadence.ts still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/hooks/useCaptureCadence.ts"))).toBe(true);
  });

  it("src/hooks/useCapture.ts still exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../src/hooks/useCapture.ts"))).toBe(true);
  });

  it("supabase/functions/apply-capture/index.ts still exists (edge fn preserved)", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../supabase/functions/apply-capture/index.ts"))).toBe(true);
  });

  it("supabase/functions/extract-scores/index.ts still exists (OCR edge fn preserved)", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../supabase/functions/extract-scores/index.ts"))).toBe(true);
  });
});
