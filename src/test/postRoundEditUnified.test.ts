import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #28 commit 2 — Post-round edit path is photo-free.
//
// PR #11 introduced post-round score correction via the
// "Edit Scores" path: /edit-scores?id=<roundId> → RoundEditScores
// grid UI. PR #27 commit 2 removed the photo-driven correction
// (the "Fix scores / add photo" CTA + FinalPhotoGate). This file
// asserts that the post-round edit path remains:
//
//   - Wired in App.tsx as an active route
//   - Reachable from RoundSpectateView ("Edit scores" link)
//   - Free of any photo affordance: no "Take photo" / "Add photo"
//     / "📸" / "scorecard photo" copy on RoundDetailPage,
//     RoundSpectateView, the completion screen of
//     CrybabyActiveRound, or RoundEditScores itself
//   - Free of any photo-component imports (CaptureFlow,
//     FinalPhotoGate, useCapture, etc.) on these pages
//
// The five preserved files from PR #27 (CapturePrompt.tsx,
// CaptureButton.tsx, FinalPhotoGate.tsx, useCapture.ts,
// useCaptureCadence.ts) keep their dead-code markers and aren't
// scanned here — they're intentionally dormant. EditHammerModal
// stays out of scope: it uses CaptureFlow under the hood for
// trigger='hammer_correction' (no scores changed, no photo UX),
// which is the surviving "post-round correction" path PR #11
// introduced for hammer mistakes specifically.
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

const PHOTO_COPY_REGEX = /Take photo|Add photo|Add scorecard|scorecard photo|📸/i;
const PHOTO_IMPORT_REGEXES: ReadonlyArray<RegExp> = [
  /from\s+["']@\/components\/capture\/CaptureFlow["']/,
  /from\s+["']@\/components\/capture\/CaptureButton["']/,
  /from\s+["']@\/components\/capture\/CapturePrompt["']/,
  /from\s+["']@\/components\/FinalPhotoGate["']/,
  /from\s+["']@\/hooks\/useCapture["']/,
  /from\s+["']@\/hooks\/useCaptureCadence["']/,
];

// ------------------------------------------------------------
// Block 1 — Edit-scores route is wired and reachable.
// ------------------------------------------------------------

describe("Post-round edit path — wired (PR #28)", () => {
  it("App.tsx imports RoundEditScores and wires the /edit-scores route", () => {
    const src = readFile("src/App.tsx");
    expect(src).toMatch(/import\s+RoundEditScores\s+from\s+["']\.\/pages\/RoundEditScores["']/);
    expect(src).toMatch(/path="\/edit-scores"[\s\S]{0,200}<RoundEditScores\s*\/>/);
  });

  it("RoundSpectateView surfaces the Edit-scores navigation", () => {
    const src = readFile("src/pages/RoundSpectateView.jsx");
    expect(src).toMatch(/navigate\(`\/edit-scores\?id=\$\{roundId\}`\)/);
  });

  it("RoundEditScores exports a default component (the page is implemented)", () => {
    const src = readFile("src/pages/RoundEditScores.jsx");
    expect(src).toMatch(/export\s+default\s+function\s+RoundEditScores/);
  });
});

// ------------------------------------------------------------
// Block 2 — Edit-scores page has no photo affordances.
// ------------------------------------------------------------

describe("RoundEditScores — photo-free (PR #28)", () => {
  const SRC = readFile("src/pages/RoundEditScores.jsx");

  // Strip JS line + block comments so historical PR-marker comments
  // (if any) don't false-match.
  const stripped = SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("does NOT include any photo-related UI copy", () => {
    expect(stripped).not.toMatch(PHOTO_COPY_REGEX);
  });

  it("does NOT import any photo-pipeline component", () => {
    for (const re of PHOTO_IMPORT_REGEXES) {
      expect(SRC).not.toMatch(re);
    }
  });

  it("does NOT read needs_final_photo or needsFinalPhoto", () => {
    expect(stripped).not.toMatch(/needs_final_photo/);
    expect(stripped).not.toMatch(/needsFinalPhoto/);
  });

  it("does NOT navigate to a CaptureFlow / capture trigger", () => {
    expect(stripped).not.toMatch(/openAdHoc|openGameDriven|openPostRoundCorrection/);
    expect(stripped).not.toMatch(/post_round_correction/);
  });
});

// ------------------------------------------------------------
// Block 3 — RoundDetailPage / RoundSpectateView have no photo affordances.
// ------------------------------------------------------------

describe("RoundDetailPage — photo-free (PR #28)", () => {
  const SRC = readFile("src/pages/RoundDetailPage.tsx");
  const stripped = SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("does NOT include any photo-related UI copy", () => {
    expect(stripped).not.toMatch(PHOTO_COPY_REGEX);
  });

  it("does NOT import any photo-pipeline component", () => {
    for (const re of PHOTO_IMPORT_REGEXES) {
      expect(SRC).not.toMatch(re);
    }
  });

  it("does NOT read needs_final_photo", () => {
    expect(stripped).not.toMatch(/needs_final_photo/);
    expect(stripped).not.toMatch(/needsFinalPhoto/);
  });
});

describe("RoundSpectateView — photo-free (PR #28)", () => {
  const SRC = readFile("src/pages/RoundSpectateView.jsx");
  const stripped = SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("does NOT include any photo-related UI copy on the spectate view", () => {
    expect(stripped).not.toMatch(PHOTO_COPY_REGEX);
  });

  it("does NOT import any photo-pipeline component", () => {
    for (const re of PHOTO_IMPORT_REGEXES) {
      expect(SRC).not.toMatch(re);
    }
  });
});

// ------------------------------------------------------------
// Block 4 — Active-round completion screen has no photo CTA.
// PR #27 commit 2 removed the "Fix scores / add photo" CTA;
// this re-asserts in case a future commit re-introduces a
// camera-prefixed button.
// ------------------------------------------------------------

describe("CrybabyActiveRound completion screen — photo-free (PR #28)", () => {
  const SRC = readFile("src/pages/CrybabyActiveRound.tsx");
  const stripped = SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("does NOT render any photo-related UI copy", () => {
    expect(stripped).not.toMatch(PHOTO_COPY_REGEX);
  });

  it("does NOT carry a post-round-correction-cta testid", () => {
    expect(stripped).not.toMatch(/data-testid="post-round-correction-cta"/);
  });

  it("does NOT import the photo-pipeline components removed in PR #27", () => {
    // CaptureFlow, useCapture, FinalPhotoGate, CaptureButton, CapturePrompt
    // imports should all be absent. EditHammerModal lives at
    // src/components/capture/hammer/EditHammerModal — that import is
    // allowed (it's the surviving hammer-correction path).
    expect(SRC).not.toMatch(/from\s+["']@\/components\/capture\/CaptureFlow["']/);
    expect(SRC).not.toMatch(/from\s+["']@\/components\/capture\/CaptureButton["']/);
    expect(SRC).not.toMatch(/from\s+["']@\/components\/capture\/CapturePrompt["']/);
    expect(SRC).not.toMatch(/from\s+["']@\/components\/FinalPhotoGate["']/);
    expect(SRC).not.toMatch(/from\s+["']@\/hooks\/useCapture["']/);
    expect(SRC).not.toMatch(/from\s+["']@\/hooks\/useCaptureCadence["']/);
  });
});

// ------------------------------------------------------------
// Block 5 — The five preserved photo files retain their PR #27
// dead-code markers (sanity check; PR #28 doesn't move them).
// ------------------------------------------------------------

describe("Preserved photo files — PR #27 markers intact (PR #28)", () => {
  const PRESERVED = [
    "src/components/capture/CapturePrompt.tsx",
    "src/components/capture/CaptureButton.tsx",
    "src/components/FinalPhotoGate.tsx",
    "src/hooks/useCapture.ts",
    "src/hooks/useCaptureCadence.ts",
  ] as const;

  for (const rel of PRESERVED) {
    it(`${rel} carries a PR #27 dead-code marker`, () => {
      const src = readFile(rel);
      // Comments are line-broken with `// ` (or ` * ` in JSDoc), which
      // splits multi-word phrases across lines. Normalize whitespace
      // and strip leading `// ` / ` * ` / `*` so the marker assertion
      // matches across line breaks.
      const normalized = src
        .replace(/\r/g, "")
        .replace(/\n\s*(\*|\/\/)\s?/g, " ")
        .replace(/\s+/g, " ");
      expect(normalized).toMatch(/PR #27[\s\S]{0,400}(no longer rendered|no longer called|no active call sites|safe to delete after)/i);
    });
  }
});
