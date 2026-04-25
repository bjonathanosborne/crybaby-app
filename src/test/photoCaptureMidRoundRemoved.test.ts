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

  // PR #27 commit 2: CaptureFlow import is now also gone (the
  // completion-screen render that needed it was removed alongside
  // FinalPhotoGate). The "import gone" assertion now lives in
  // photoCapturePostRoundRemoved.test.ts.
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
    // PR #27 commit 2 collapsed the commit-1 "Mid-round photo UI
    // removed" marker into a single render-site marker that
    // documents both removals. Anchor on the umbrella marker phrase.
    expect(SRC).toMatch(/PR #27:\s*Photo capture removed from gameplay UI/);
    // Should NOT find the old "Phase 2 capture flow modal" sibling
    // comment that lived next to the active-round flow modal.
    expect(SRC).not.toMatch(/Phase 2 capture flow modal — shared by ad-hoc \+ game-driven/);
  });
});

// PR #27 commit 2: onApplied callback is gone with the useCapture
// hook call. The retryNonce bump it used to do is no longer needed
// because nothing mutates round state out-of-band on the client.
// In-band score edits already drive retryNonce via the hole-submit
// path. Absence of `onApplied` is locked in by
// photoCapturePostRoundRemoved.test.ts (see "does NOT call useCapture").

describe("CrybabyActiveRound — preservation markers (PR #27 commit 1)", () => {
  it("import-block has a PR #27 comment explaining what was removed", () => {
    expect(SRC).toMatch(/PR #27:\s*Photo capture removed from gameplay UI/);
  });

  it("preservation rationale documents the legacy-display path", () => {
    // Comments are line-broken with `// ` prefixes — match the key
    // phrases independently to survive reformatting.
    expect(SRC).toMatch(/legacy/);
    expect(SRC).toMatch(/CaptureTile/);
    expect(SRC).toMatch(/CaptureAppliedCard/);
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
