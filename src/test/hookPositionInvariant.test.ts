import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// PR #24 commit 1 — Hook-position invariant in CrybabyActiveRound.
//
// Regression guard for the #310 crash that shipped 2026-04-21 in
// PR #19 and went undetected through PR #23. Root cause: a
// `useEffect(...)` was introduced BELOW the `// --- Early returns
// (after all hooks) ---` marker line, which is a flat rules-of-hooks
// violation — the first render (loading=true) returns early before
// the hook is called; the second render (loading=false) reaches it.
// React sees N hooks on render 1, N+1 on render 2, throws #310.
//
// This test scans the file for any `useState / useEffect / useMemo /
// useCallback / useRef` invocation whose line number is >= the early-
// returns marker. Any such match fails the test.
//
// The scanner only enforces the invariant for the top-level
// CrybabyActiveRound function body. Inner function components
// declared in the same file (Leaderboard, HoleResultCard,
// TeamBanner, HammerModal, etc.) have their own hook chains and are
// unaffected — React allows each component to have its own hook
// ordering.
// ============================================================

const ANCHOR = "// --- Early returns (after all hooks) ---";
// Matches both bare calls and assignment-bound hook calls. Anchors on
// a word boundary preceding the hook name so we don't match e.g.
// `handleUseState` or property accesses in prose comments.
const HOOK_PATTERN = /(?:^|[\s=(,])(useState|useEffect|useMemo|useCallback|useRef)\s*(?:<[^>]*>)?\s*\(/;

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

describe("CrybabyActiveRound — hook position invariant", () => {
  const src = readFile("src/pages/CrybabyActiveRound.tsx");
  const lines = src.split("\n");

  it("anchor comment '// --- Early returns (after all hooks) ---' is present", () => {
    expect(src).toContain(ANCHOR);
  });

  it("no top-level hook call appears after the anchor (regression guard for PR #24)", () => {
    const anchorLine = lines.findIndex(l => l.trim() === ANCHOR.trim());
    expect(anchorLine).toBeGreaterThanOrEqual(0);

    // Find the end of the CrybabActiveRound function. We approximate it
    // with the next line that starts with `function ` (child component
    // declared at module scope below the main component) — hooks inside
    // those child components are allowed.
    let componentEndLine = lines.length;
    for (let i = anchorLine + 1; i < lines.length; i++) {
      // Module-level function declarations below the component mark the
      // boundary. They dedent to column 0.
      if (/^function\s+[A-Z]/.test(lines[i])) {
        componentEndLine = i;
        break;
      }
    }

    const offenders: Array<{ line: number; content: string }> = [];
    for (let i = anchorLine; i < componentEndLine; i++) {
      if (HOOK_PATTERN.test(lines[i])) {
        offenders.push({ line: i + 1, content: lines[i].trim() });
      }
    }

    if (offenders.length > 0) {
      const report = offenders.map(o => `  L${o.line}: ${o.content}`).join("\n");
      throw new Error(
        "Top-level hook call(s) found AFTER the early-returns marker — this is a " +
        "rules-of-hooks violation that will throw React #310 when loading " +
        "flips from true to false. Move the hook(s) above the marker:\n" + report,
      );
    }
    expect(offenders.length).toBe(0);
  });

  it("every top-level hook BEFORE the anchor is a legitimate hook (sanity check)", () => {
    // Counter-test: verify we find hooks ABOVE the marker. If the file
    // were rewritten to have zero hooks, the test above would trivially
    // pass. This guards against that degenerate case.
    const anchorLine = lines.findIndex(l => l.trim() === ANCHOR.trim());
    let aboveMarkerHookCount = 0;
    for (let i = 0; i < anchorLine; i++) {
      if (HOOK_PATTERN.test(lines[i])) aboveMarkerHookCount += 1;
    }
    expect(aboveMarkerHookCount).toBeGreaterThan(20); // we have ~40 hooks today; >20 is generous
  });

  it("scorecard auto-advance useEffect is positioned above early returns (specific to PR #24 fix)", () => {
    const anchorLine = lines.findIndex(l => l.trim() === ANCHOR.trim());
    // The relocated useEffect references `round.gameMode !== 'scorecard'`
    // inside its body — find the FIRST such line.
    const scorecardCheckLine = lines.findIndex(l => l.includes("round.gameMode !== 'scorecard'"));
    expect(scorecardCheckLine).toBeGreaterThanOrEqual(0);
    expect(scorecardCheckLine).toBeLessThan(anchorLine);
  });

  it("pointer-comment at the old PR #19 location documents the move (archaeology)", () => {
    expect(src).toMatch(
      /PR #24 commit 1: Scorecard auto-advance useEffect MOVED to the[\s\S]*?top-of-body hook block/,
    );
  });
});
