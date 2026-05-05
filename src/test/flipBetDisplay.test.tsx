import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import FlipTeamsBadge from "@/components/flip/FlipTeamsBadge";
import type { TeamInfo, Player } from "@/lib/gameEngines";

// ============================================================
// PR #55 commit 3 — Flip bet display regression.
//
// Pre-PR-55 the runtime showed a single dollar amount for the
// hole stake, leaving the 3v2 asymmetric math implicit. Users
// had to know the canonical Flip rule (3-man risks $B, 2-man
// risks $1.5B per player) to interpret the number. PR #55 wires
// the derived split into all three surfaces:
//   1. CrybabyActiveRound's TeamBanner (live scoring header)
//   2. FlipTeamsBadge (persistent hole-N teams strip)
//   3. CrybabySetupWizard's flip-config-panel (round setup)
// ============================================================

const repoRoot = path.resolve(__dirname, "..", "..");

const players: Player[] = [
  { id: "p1", name: "A", handicap: 10, color: "#16A34A" },
  { id: "p2", name: "B", handicap: 10, color: "#16A34A" },
  { id: "p3", name: "C", handicap: 10, color: "#DC2626" },
  { id: "p4", name: "D", handicap: 10, color: "#DC2626" },
  { id: "p5", name: "E", handicap: 10, color: "#DC2626" },
];

const teams3v2: TeamInfo = {
  teamA: { name: "Heads", color: "#16A34A", players: [players[0], players[1]] }, // 2-man
  teamB: { name: "Tails", color: "#DC2626", players: [players[2], players[3], players[4]] }, // 3-man
};

describe("FlipTeamsBadge stakes display — PR #55 commit 3", () => {
  it("renders 3v2 split when baseBet is provided", () => {
    render(
      <FlipTeamsBadge
        holeNumber={1}
        teams={teams3v2}
        baseBet={4}
      />,
    );
    const stakes = screen.getByTestId("flip-teams-badge-stakes");
    expect(stakes.textContent).toContain("$4 3-man");
    expect(stakes.textContent).toContain("$6 2-man");
  });

  it("hides the stakes line when baseBet is omitted (legacy callers)", () => {
    render(
      <FlipTeamsBadge
        holeNumber={1}
        teams={teams3v2}
      />,
    );
    expect(screen.queryByTestId("flip-teams-badge-stakes")).toBeNull();
  });

  it("derives the 2-man stake as 1.5× baseBet", () => {
    render(
      <FlipTeamsBadge
        holeNumber={1}
        teams={teams3v2}
        baseBet={10}
      />,
    );
    const stakes = screen.getByTestId("flip-teams-badge-stakes");
    expect(stakes.textContent).toContain("$10 3-man");
    expect(stakes.textContent).toContain("$15 2-man");
  });
});

describe("source-level guards — bet display surfaces", () => {
  it("CrybabyActiveRound's TeamBanner accepts an isFlip prop and renders 3v2 stakes", () => {
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
      "utf8",
    );
    expect(src).toMatch(/function TeamBanner\(\{ teams, holeValue, hammerDepth, isFlip \}/);
    expect(src).toMatch(/\$\{flipThreeMan\} 3-man/);
    expect(src).toMatch(/\$\{flipTwoMan\} 2-man/);
    expect(src).toMatch(/effectiveValue \* 1\.5/);
  });

  it("CrybabyActiveRound passes isFlip to TeamBanner only for Flip base game (1-15)", () => {
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabyActiveRound.tsx"),
      "utf8",
    );
    expect(src).toMatch(/isFlip=\{round\.gameMode === 'flip' && currentHole <= 15\}/);
  });

  it("CrybabySetupWizard shows the 3v2 stakes split next to the base bet", () => {
    const src = fs.readFileSync(
      path.join(repoRoot, "src/pages/CrybabySetupWizard.jsx"),
      "utf8",
    );
    expect(src).toMatch(/data-testid="flip-stakes-derived"/);
    expect(src).toMatch(/\$\{flipBaseBet\} 3-man/);
    expect(src).toMatch(/\$\{\(flipBaseBet \* 3\) \/ 2\} 2-man/);
  });
});
